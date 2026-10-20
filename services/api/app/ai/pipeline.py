import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entities import Report, MediaAsset, AIAssessment, Incident
from app.common.spatial import extract_lat_lng
from app.core.outbox import create_outbox_event
from app.ai.adapters.text_classifier import TextClassifierAdapter
from app.ai.adapters.voice_transcriber import VoiceTranscriberAdapter
from app.ai.adapters.vision_detector import VisionDetectorAdapter
from app.ai.adapters.duplicate_matcher import DuplicateMatcherAdapter
from app.ai.schemas import (
    TextAssessmentSchema,
    VoiceTranscriptionSchema,
    VisionDetectionSchema,
    DuplicateCandidateSchema,
    EvidenceAssessmentSchema,
)

logger = logging.getLogger("sentinelgrid.ai.pipeline")

text_classifier = TextClassifierAdapter()
voice_transcriber = VoiceTranscriberAdapter()
vision_detector = VisionDetectorAdapter()
duplicate_matcher = DuplicateMatcherAdapter()

async def execute_report_ai_pipeline(
    session: AsyncSession,
    report_id: uuid.UUID
) -> Optional[EvidenceAssessmentSchema]:
    """
    Execute multimodal AI triage pipeline for an ingested report.
    Guarantees failure isolation: model crashes never block report flow.
    Persists granular AIAssessment records and emits 'ai.assessment.ready' event.
    """
    stmt = (
        select(Report)
        .options(
            selectinload(Report.media_assets),
            selectinload(Report.ai_assessments),
            selectinload(Report.incident_links)
        )
        .where(Report.id == report_id)
    )
    res = await session.execute(stmt)
    report = res.scalar_one_or_none()

    if not report:
        logger.error(f"Report {report_id} not found for AI pipeline execution")
        return None

    if report.status == "cancelled":
        logger.info(f"Report {report_id} was cancelled; skipping AI execution")
        return None

    report.processing_state = "queued_for_ai"
    await session.flush()

    text_output: Optional[TextAssessmentSchema] = None
    voice_output: Optional[VoiceTranscriptionSchema] = None
    vision_output: Optional[VisionDetectionSchema] = None
    duplicate_candidates: List[DuplicateCandidateSchema] = []
    has_failure = False

    # 1. Voice Transcription (if audio media present)
    audio_assets = [m for m in report.media_assets if m.file_type == "audio"]
    if audio_assets:
        try:
            primary_audio = audio_assets[0]
            voice_output = await voice_transcriber.predict(s3_key=primary_audio.s3_key)
            
            assessment = AIAssessment(
                report_id=report.id,
                pipeline_type="voice_transcription",
                model_name="VoiceTranscriberAdapter",
                model_version=voice_output.modelVersion,
                confidence_score=voice_output.confidence,
                explanation=f"Voice memo transcribed in {voice_output.detectedLanguage}",
                raw_output=voice_output.model_dump(),
                is_flagged_uncertain=(voice_output.confidence < 0.80),
            )
            session.add(assessment)

            # If report text was empty, populate with voice transcript
            if not report.raw_text and voice_output.transcript:
                report.raw_text = voice_output.transcript
        except Exception as e:
            logger.error(f"Voice transcription failed for report {report.id}: {e}", exc_info=True)
            has_failure = True
            session.add(
                AIAssessment(
                    report_id=report.id,
                    pipeline_type="voice_transcription",
                    model_name="VoiceTranscriberAdapter",
                    model_version="error-fallback",
                    confidence_score=None,
                    explanation=f"Voice transcription error: {str(e)}",
                    raw_output={"error": str(e), "reviewRequired": True},
                    is_flagged_uncertain=True,
                )
            )

    # 2. Text Classification
    try:
        text_output = await text_classifier.predict(report.raw_text or "")
        assessment = AIAssessment(
            report_id=report.id,
            pipeline_type="text_classifier",
            model_name="TextClassifierAdapter",
            model_version=text_output.modelVersion,
            confidence_score=text_output.modelScore,
            explanation=text_output.explanation,
            raw_output=text_output.model_dump(),
            is_flagged_uncertain=text_output.reviewRequired,
        )
        session.add(assessment)
    except Exception as e:
        logger.error(f"Text classification failed for report {report.id}: {e}", exc_info=True)
        has_failure = True
        session.add(
            AIAssessment(
                report_id=report.id,
                pipeline_type="text_classifier",
                model_name="TextClassifierAdapter",
                model_version="error-fallback",
                confidence_score=None,
                explanation=f"Text classification error: {str(e)}",
                raw_output={"error": str(e), "reviewRequired": True},
                is_flagged_uncertain=True,
            )
        )

    # 3. Vision Detection (if image media present)
    image_assets = [m for m in report.media_assets if m.file_type == "image"]
    if image_assets:
        try:
            primary_img = image_assets[0]
            vision_output = await vision_detector.predict(s3_key=primary_img.s3_key)
            assessment = AIAssessment(
                report_id=report.id,
                pipeline_type="vision_fire_smoke",
                model_name="VisionDetectorAdapter",
                model_version=vision_output.modelVersion,
                confidence_score=vision_output.modelScore,
                explanation=vision_output.explanation,
                raw_output=vision_output.model_dump(),
                is_flagged_uncertain=(vision_output.finding == "unavailable"),
            )
            session.add(assessment)
        except Exception as e:
            logger.error(f"Vision detection failed for report {report.id}: {e}", exc_info=True)
            has_failure = True
            session.add(
                AIAssessment(
                    report_id=report.id,
                    pipeline_type="vision_fire_smoke",
                    model_name="VisionDetectorAdapter",
                    model_version="error-fallback",
                    confidence_score=None,
                    explanation=f"Vision detection error: {str(e)}",
                    raw_output={"error": str(e), "reviewRequired": True},
                    is_flagged_uncertain=True,
                )
            )

    # 4. Duplicate Matching
    try:
        r_lat, r_lng = extract_lat_lng(report.location)
        active_incidents = (
            await session.execute(
                select(Incident)
                .where(Incident.status.notin_(["closed", "duplicate", "cancelled"]))
                .limit(20)
            )
        ).scalars().all()

        duplicate_candidates = await duplicate_matcher.predict(
            category=report.category,
            text=report.raw_text,
            lat=r_lat,
            lng=r_lng,
            candidates=active_incidents
        )

        if duplicate_candidates:
            assessment = AIAssessment(
                report_id=report.id,
                pipeline_type="duplicate_matching",
                model_name="DuplicateMatcherAdapter",
                model_version="heuristic-v1",
                confidence_score=duplicate_candidates[0].score,
                explanation=f"Identified {len(duplicate_candidates)} duplicate incident candidates",
                raw_output={"candidates": [c.model_dump() for c in duplicate_candidates]},
                is_flagged_uncertain=(duplicate_candidates[0].recommendation == "review"),
            )
            session.add(assessment)
    except Exception as e:
        logger.error(f"Duplicate matching failed for report {report.id}: {e}", exc_info=True)
        has_failure = True

    # Update processing state
    report.processing_state = "ai_failed" if has_failure else "ai_complete"

    # Assemble comprehensive evidence payload matching frontend contract
    evidence = EvidenceAssessmentSchema(
        linkedReports=len(report.incident_links) if report.incident_links else 1,
        temporalConsistency="aligned",
        locationConsistency="aligned",
        reusedMediaFlag=False,
        corroboratingVisual=(vision_output is not None and vision_output.finding == "possible_fire_smoke_evidence"),
        missing=[] if report.raw_text else ["user_description"],
        conflicting=[],
        text=text_output,
        voice=voice_output,
        vision=vision_output,
        duplicates=duplicate_candidates,
    )

    # Emit transactional outbox event
    await create_outbox_event(
        session=session,
        aggregate_type="Report",
        aggregate_id=report.id,
        event_type="ai.assessment.ready",
        payload={
            "report_id": str(report.id),
            "processing_state": report.processing_state,
            "evidence": evidence.model_dump(),
        }
    )

    await session.commit()
    return evidence
