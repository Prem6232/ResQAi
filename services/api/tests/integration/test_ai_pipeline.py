import pytest
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import status

from app.models.entities import Report, MediaAsset, AIAssessment, Incident, AuditLog, OutboxEvent
from app.ai.pipeline import execute_report_ai_pipeline
from app.ai.celery_tasks import async_relay_outbox_events
from app.ai.adapters.text_classifier import TextClassifierAdapter
from app.ai.adapters.voice_transcriber import VoiceTranscriberAdapter
from app.ai.adapters.vision_detector import VisionDetectorAdapter
from app.ai.adapters.duplicate_matcher import DuplicateMatcherAdapter

@pytest.fixture
async def citizen_auth_headers(client: httpx.AsyncClient) -> dict:
    """Fixture providing auth headers for seeded citizen."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def operator_auth_headers(client: httpx.AsyncClient) -> dict:
    """Fixture providing auth headers for seeded operator."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "operator@campus.demo", "password": "demo1234"}
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_ai_text_classifier_categories():
    """Verify text classification adapter matches frontend expectations across categories."""
    adapter = TextClassifierAdapter(mode="mock")

    # 1. Fire / Smoke
    res_fire = await adapter.predict("Huge fire and dark smoke near hostel B")
    assert res_fire.suggestedCategory == "fire_smoke"
    assert res_fire.suggestedUrgency == "critical"
    assert res_fire.modelScore >= 0.90
    assert not res_fire.reviewRequired

    # 2. Road accident
    res_crash = await adapter.predict("Two bikes collision near north gate, rider down")
    assert res_crash.suggestedCategory == "road_accident"
    assert res_crash.suggestedUrgency == "high"
    assert res_crash.modelScore >= 0.85

    # 3. Medical trauma
    res_med = await adapter.predict("Student unconscious and heavy blood loss")
    assert res_med.suggestedCategory == "medical"
    assert res_med.suggestedUrgency == "critical"
    assert res_med.modelScore >= 0.90

    # 4. Water flood
    res_flood = await adapter.predict("Heavy water overflow from burst pipe in lab")
    assert res_flood.suggestedCategory == "water_flood"
    assert res_flood.suggestedUrgency == "medium"

    # 5. Generic hazard requires human review
    res_hazard = await adapter.predict("Strange buzzing sound near electrical box")
    assert res_hazard.suggestedCategory == "hazard"
    assert res_hazard.reviewRequired is True

@pytest.mark.asyncio
async def test_ai_voice_transcriber_adapter():
    """Verify voice transcriber returns benchmark mock transcript."""
    adapter = VoiceTranscriberAdapter(mode="mock")
    res = await adapter.predict(s3_key="evidence/audio/memo_123.m4a")
    assert res.transcript != ""
    assert "Smoke" in res.transcript
    assert res.confidence >= 0.90
    assert res.detectedLanguage.startswith("en-IN")

@pytest.mark.asyncio
async def test_ai_vision_detector_adapter():
    """Verify vision detector returns fire/smoke bounding boxes."""
    adapter = VisionDetectorAdapter(mode="mock")
    res = await adapter.predict(s3_key="evidence/images/fire_scene.jpg")
    assert res.pipeline == "fire_smoke"
    assert res.finding == "possible_fire_smoke_evidence"
    assert res.modelScore >= 0.90
    assert len(res.boundingBoxes) >= 2
    labels = [b.label for b in res.boundingBoxes]
    assert "smoke_plume" in labels
    assert "active_flame" in labels

@pytest.mark.asyncio
async def test_ai_duplicate_matcher_adapter():
    """Verify duplicate matcher returns candidate pairings."""
    adapter = DuplicateMatcherAdapter(mode="mock")
    res = await adapter.predict(category="fire_smoke", text="Fire in cafeteria")
    assert len(res) >= 1
    assert res[0].incidentId == "402"
    assert res[0].recommendation == "likely_related"

@pytest.mark.asyncio
async def test_full_ai_pipeline_execution_and_persistence(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """
    Submits a report with media attachments and runs the multimodal AI pipeline.
    Verifies AIAssessment records, processing_state transition, and outbox event.
    """
    # 1. Citizen creates a report with fire description
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Thick black smoke and flames coming from cafeteria roof",
            "location": {"lat": 28.5455, "lng": 77.2735},
            "idempotencyKey": f"ai_pipe_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_id = uuid.UUID(rep_resp.json()["id"])

    # 2. Add an image media asset to the report
    img_asset = MediaAsset(
        report_id=rep_id,
        file_type="image",
        file_name="flames.jpg",
        s3_key=f"reports/{rep_id}/flames.jpg",
        mime_type="image/jpeg",
    )
    db_session.add(img_asset)
    await db_session.commit()

    # 3. Execute AI pipeline
    evidence = await execute_report_ai_pipeline(db_session, rep_id)
    assert evidence is not None
    assert evidence.text is not None
    assert evidence.text.suggestedCategory == "fire_smoke"
    assert evidence.vision is not None
    assert evidence.vision.finding == "possible_fire_smoke_evidence"
    assert evidence.corroboratingVisual is True

    # 4. Verify Report state in database
    rep_db = await db_session.get(Report, rep_id)
    assert rep_db.processing_state == "ai_complete"

    # 5. Verify AIAssessment rows persisted
    stmt = select(AIAssessment).where(AIAssessment.report_id == rep_id)
    assessments = (await db_session.execute(stmt)).scalars().all()
    pipeline_types = [a.pipeline_type for a in assessments]
    assert "text_classifier" in pipeline_types
    assert "vision_fire_smoke" in pipeline_types

    # 6. Verify transactional outbox event
    outbox_stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_id == rep_id,
        OutboxEvent.event_type == "ai.assessment.ready"
    )
    outbox_event = (await db_session.execute(outbox_stmt)).scalars().first()
    assert outbox_event is not None
    assert outbox_event.payload["processing_state"] == "ai_complete"

@pytest.mark.asyncio
async def test_ai_pipeline_failure_isolation(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    db_session: AsyncSession,
    monkeypatch
):
    """
    Simulate model crash during text classifier execution.
    Report must NOT fail or be discarded; marked 'ai_failed' and flagged for human review.
    """
    # 1. Submit report
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Scooter accident on main road",
            "location": {"lat": 28.5460, "lng": 77.2740},
            "idempotencyKey": f"fail_iso_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_id = uuid.UUID(rep_resp.json()["id"])

    # 2. Monkeypatch text_classifier to simulate fatal crash
    from app.ai.pipeline import text_classifier
    async def crash_predict(*args, **kwargs):
        raise RuntimeError("GPU CUDA OutOfMemory simulated error")
    monkeypatch.setattr(text_classifier, "predict", crash_predict)

    # 3. Execute pipeline
    evidence = await execute_report_ai_pipeline(db_session, rep_id)
    assert evidence is not None

    # 4. Verify failure recovery
    rep_db = await db_session.get(Report, rep_id)
    assert rep_db.processing_state == "ai_failed"
    assert rep_db.status == "submitted" # Report remains active and available for operator review

    # Check fallback assessment
    stmt = select(AIAssessment).where(
        AIAssessment.report_id == rep_id,
        AIAssessment.pipeline_type == "text_classifier"
    )
    ass = (await db_session.execute(stmt)).scalars().first()
    assert ass is not None
    assert ass.is_flagged_uncertain is True
    assert "CUDA OutOfMemory" in ass.explanation

@pytest.mark.asyncio
async def test_celery_outbox_relay_claims_and_processes(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """
    Verify outbox relay claims pending report events with SKIP LOCKED,
    triggers AI pipeline, and marks event published.
    """
    # Create report which automatically writes OutboxEvent(pending)
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "medical",
            "text": "Injured person needs first aid",
            "location": {"lat": 28.5470, "lng": 77.2750},
            "idempotencyKey": f"relay_test_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_id = uuid.UUID(rep_resp.json()["id"])

    # Verify pending outbox event exists
    stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_id == rep_id,
        OutboxEvent.event_type == "report.created"
    )
    ev_before = (await db_session.execute(stmt)).scalars().first()
    ev_id = ev_before.id

    # Run the outbox relay to drain events
    for _ in range(10):
        processed = await async_relay_outbox_events(batch_size=100)
        db_session.expire_all()
        ev_refetch = await db_session.get(OutboxEvent, ev_id)
        if ev_refetch and ev_refetch.status == "published":
            ev_before = ev_refetch
            break
        if processed == 0:
            break

    # Verify event is now published
    assert ev_before.status == "published"
    assert ev_before.processed_at is not None

    # Verify report was processed by AI
    db_session.expire_all()
    rep = await db_session.get(Report, rep_id)
    assert rep.processing_state in ["ai_complete", "queued_for_ai"]

@pytest.mark.asyncio
async def test_operator_ai_override_and_audit(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    db_session: AsyncSession
):
    """
    Operator overrides AI category and urgency.
    Verifies incident update and immutable OVERRIDE_AI audit record.
    """
    inc = Incident(
        public_code=f"AI-{uuid.uuid4().hex[:8].upper()}",
        title="AI Override Test Incident",
        category="hazard",
        urgency="medium",
        status="reported",
        location="SRID=4326;POINT(77.2731 28.5452)",
    )
    db_session.add(inc)
    await db_session.commit()
    inc_id = str(inc.id)

    # Operator overrides AI to critical fire_smoke
    override_resp = await client.post(
        "/api/v1/operator/actions/override",
        json={
            "incidentId": inc_id,
            "category": "fire_smoke",
            "urgency": "critical",
            "reason": "Operator confirmed active structure fire via CCTV feed"
        },
        headers=operator_auth_headers
    )
    assert override_resp.status_code == status.HTTP_200_OK
    data = override_resp.json()
    assert data["category"] == "fire_smoke"
    assert data["urgency"] == "critical"

    # Verify audit record
    audit_stmt = select(AuditLog).where(
        AuditLog.target_id == inc_id,
        AuditLog.action == "OVERRIDE_AI"
    )
    audit = (await db_session.execute(audit_stmt)).scalars().first()
    assert audit is not None
    assert audit.details["new_category"] == "fire_smoke"
    assert audit.details["new_urgency"] == "critical"
    assert "CCTV feed" in audit.details["reason"]

@pytest.mark.asyncio
async def test_incident_detail_contains_ai_evidence(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    db_session: AsyncSession
):
    """Verify that operator incident detail workspace embeds enriched AI evidence."""
    # 1. Create report and execute AI pipeline
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Dense smoke rising above server room",
            "location": {"lat": 28.5800, "lng": 77.2800},
            "idempotencyKey": f"detail_ai_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_data = rep_resp.json()
    rep_id = uuid.UUID(rep_data["id"])
    inc_id = rep_data["incidentId"]

    # Run AI pipeline
    await execute_report_ai_pipeline(db_session, rep_id)

    # 2. Operator gets incident detail
    detail_resp = await client.get(
        f"/api/v1/operator/incidents/{inc_id}",
        headers=operator_auth_headers
    )
    assert detail_resp.status_code == status.HTTP_200_OK
    detail_data = detail_resp.json()

    # 3. Verify evidence schema matches frontend EvidenceAssessment
    evidence = detail_data["evidence"]
    assert "linkedReports" in evidence
    assert "temporalConsistency" in evidence
    assert "text" in evidence
    assert evidence["text"]["suggestedCategory"] == "fire_smoke"
    assert "explanation" in evidence["text"]


@pytest.mark.asyncio
async def test_live_multimodal_ai_pipeline_end_to_end(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    db_session: AsyncSession,
    monkeypatch,
):
    """
    Full live-mode E2E check across MinIO S3 + PostgreSQL/PostGIS + all 4 real ML models:
    Faster-Whisper CT2, MuRIL ONNX, FCOS-ResNet50-FPN ONNX, and Multilingual-E5 INT8 ONNX.
    """
    from pathlib import Path
    from app.core.config import settings
    from app.ai.warmup import preload_live_models
    from app.modules.media.service import ensure_bucket_exists, get_s3_client

    repo_root = Path(__file__).resolve().parents[4]
    memo_wav = repo_root / "ml" / "voice_transcriber" / "datasets" / "raw" / "emergency_memos" / "memo_fire_01.wav"
    fire_jpg = repo_root / "ml" / "vision_detector" / "datasets" / "raw" / "images" / "test_dfire_ood" / "test-00002-of-00003_00056_WEB10428.jpg"
    assert memo_wav.is_file() and fire_jpg.is_file()

    monkeypatch.setattr(settings, "AI_ADAPTER_MODE", "live")
    warmup_status = preload_live_models()
    assert warmup_status["text_classifier"].startswith("muril-indian-emergency-v1-onnx")
    assert warmup_status["voice_transcriber"].startswith("faster-whisper-small-ct2")
    assert warmup_status["duplicate_matcher"].startswith("e5-small-indian-duplicate-v1-onnx")
    assert warmup_status["vision_detector"].startswith("fcos-r50-fpn-indian-fire-smoke-v1-onnx")

    # Seed a nearby existing fire incident (~200m away at Chuna Bhatti: outside 150m auto-cluster, inside 300m E5 duplicate match)
    nearby_inc = Incident(
        public_code=f"LIVE-{uuid.uuid4().hex[:8].upper()}",
        title="E-rickshaw battery explosion fire and dense smoke reported at Chuna Bhatti crossing",
        category="fire_smoke",
        urgency="critical",
        status="reported",
        location="SRID=4326;POINT(77.4190 23.2158)",
        location_label="Chuna Bhatti Crossing",
    )
    db_session.add(nearby_inc)
    await db_session.commit()

    ensure_bucket_exists()
    s3 = get_s3_client(for_public_presign=False)
    audio_key = f"tests/live/{uuid.uuid4().hex}_memo.wav"
    image_key = f"tests/live/{uuid.uuid4().hex}_fire.jpg"
    s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=audio_key, Body=memo_wav.read_bytes(), ContentType="audio/wav")
    s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=image_key, Body=fire_jpg.read_bytes(), ContentType="image/jpeg")

    # Submit citizen report with Hinglish description (voice+vision media uploaded to MinIO)
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Chuna Bhatti square pe e-rickshaw mein battery blast hoke aag aur dhuwa fail gaya",
            "location": {"lat": 23.2140, "lng": 77.4190},
            "locationLabel": "Chuna Bhatti Square",
            "idempotencyKey": f"live_e2e_{uuid.uuid4().hex}",
        },
        headers=citizen_auth_headers,
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_id = uuid.UUID(rep_resp.json()["id"])
    inc_id = rep_resp.json()["incidentId"]

    db_session.add_all([
        MediaAsset(report_id=rep_id, file_type="audio", file_name="memo.wav", s3_key=audio_key, mime_type="audio/wav"),
        MediaAsset(report_id=rep_id, file_type="image", file_name="fire.jpg", s3_key=image_key, mime_type="image/jpeg"),
    ])
    await db_session.commit()

    evidence = await execute_report_ai_pipeline(db_session, rep_id)
    assert evidence is not None
    assert evidence.voice is not None and evidence.voice.modelVersion.startswith("faster-whisper-small-ct2")
    assert evidence.text is not None and evidence.text.modelVersion.startswith("muril-indian-emergency-v1-onnx")
    assert evidence.text.suggestedCategory == "fire_smoke"
    assert evidence.vision is not None and evidence.vision.adapter == "live_model"
    assert evidence.vision.finding == "possible_fire_smoke_evidence"
    assert evidence.corroboratingVisual is True
    assert any(d.incidentId == nearby_inc.public_code and d.recommendation == "likely_related" for d in evidence.duplicates)

    # Confirm persisted AIAssessment rows record real live model versions (no heuristic-v1/mock)
    ass_rows = (await db_session.execute(select(AIAssessment).where(AIAssessment.report_id == rep_id))).scalars().all()
    versions_by_type = {a.pipeline_type: a.model_version for a in ass_rows}
    assert versions_by_type["voice_transcription"].startswith("faster-whisper-small-ct2")
    assert versions_by_type["text_classifier"].startswith("muril-indian-emergency-v1-onnx")
    assert versions_by_type["vision_fire_smoke"].startswith("fcos-r50-fpn-indian-fire-smoke-v1-onnx")
    assert versions_by_type["duplicate_matching"].startswith("e5-small-indian-duplicate-v1-onnx")

    # Confirm operator detail workspace surfaces live vision & text evidence plus /health ai_mode=live
    detail = await client.get(f"/api/v1/operator/incidents/{inc_id}", headers=operator_auth_headers)
    assert detail.status_code == status.HTTP_200_OK
    detail_ev = detail.json()["evidence"]
    assert detail_ev["text"]["modelVersion"].startswith("muril-indian-emergency-v1-onnx")
    assert detail_ev["vision"]["adapter"] == "live_model"
    assert detail_ev["voice"]["modelVersion"].startswith("faster-whisper-small-ct2")

    health = await client.get("/health")
    assert health.status_code == status.HTTP_200_OK
    assert health.json()["ai_mode"] == "live"


@pytest.mark.asyncio
async def test_live_presign_upload_voice_placeholder_fusion_and_ws_fanout(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    db_session: AsyncSession,
    monkeypatch,
):
    """
    Verifies real-world citizen flow end-to-end:
    1) POST /media/upload-url -> S3/MinIO object upload -> POST /media/{id}/confirm
    2) POST /citizen/reports with mobile category 'personal_sos' and placeholder UI text
    3) Outbox relay drains 'report.created' + follow-up 'ai.assessment.ready'
    4) Faster-Whisper replaces placeholder text BEFORE live MuRIL classification
    5) WebSocket envelope carries incidentId and citizen + operator target channels
    6) Operator detail exposes evidence['voice'] and corroboratingVisual=False (audio only)
    """
    from pathlib import Path
    from app.core.config import settings
    from app.modules.media.service import ensure_bucket_exists, get_s3_client
    from app.modules.realtime.publisher import format_outbox_envelope, get_target_channels_for_event

    repo_root = Path(__file__).resolve().parents[4]
    memo_wav = repo_root / "ml" / "voice_transcriber" / "datasets" / "raw" / "emergency_memos" / "memo_fire_01.wav"
    assert memo_wav.is_file()
    monkeypatch.setattr(settings, "AI_ADAPTER_MODE", "live")
    ensure_bucket_exists()

    # 1. Presign upload URL for audio memo
    presign_resp = await client.post(
        "/api/v1/media/upload-url",
        json={
            "fileName": "voice_memo.wav",
            "mimeType": "audio/wav",
            "fileSizeBytes": memo_wav.stat().st_size,
        },
        headers=citizen_auth_headers,
    )
    assert presign_resp.status_code == status.HTTP_200_OK
    asset_id = presign_resp.json()["mediaAssetId"]

    asset_row = await db_session.get(MediaAsset, uuid.UUID(asset_id))
    assert asset_row is not None
    get_s3_client(for_public_presign=False).put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=asset_row.s3_key,
        Body=memo_wav.read_bytes(),
        ContentType="audio/wav",
    )

    confirm_resp = await client.post(f"/api/v1/media/{asset_id}/confirm", headers=citizen_auth_headers)
    assert confirm_resp.status_code == status.HTTP_200_OK

    # 2. Submit report using mobile alias 'personal_sos' and placeholder UI text
    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "personal_sos",
            "text": "Incident reported from citizen portal",
            "channel": "voice",
            "location": {"lat": 23.2310, "lng": 77.4340},
            "locationLabel": "MP Nagar Zone 2",
            "mediaAssetIds": [asset_id],
            "idempotencyKey": f"voice_relay_{uuid.uuid4().hex}",
        },
        headers=citizen_auth_headers,
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_json = rep_resp.json()
    assert rep_json["category"] == "personal_safety"
    rep_id = uuid.UUID(rep_json["id"])
    reporter_id = rep_json["reporterId"]
    inc_id = rep_json["incidentId"]

    # 3. Single outbox relay run drains report.created AND immediately relays ai.assessment.ready
    processed = await async_relay_outbox_events(batch_size=50)
    assert processed >= 2

    db_session.expire_all()
    rep_db = await db_session.get(Report, rep_id)
    assert rep_db is not None
    assert rep_db.processing_state == "ai_complete"
    assert rep_db.raw_text != "Incident reported from citizen portal"
    assert len(rep_db.raw_text.strip()) > 10

    ai_ev = (
        await db_session.execute(
            select(OutboxEvent).where(
                OutboxEvent.aggregate_id == rep_id,
                OutboxEvent.event_type == "ai.assessment.ready",
            )
        )
    ).scalars().first()
    assert ai_ev is not None
    assert ai_ev.status == "published"
    assert ai_ev.payload.get("incident_id") == inc_id
    assert ai_ev.payload.get("reporter_id") == reporter_id

    envelope = format_outbox_envelope(ai_ev)
    assert envelope["incidentId"] == inc_id
    internal_channels, _ = get_target_channels_for_event(ai_ev)
    assert "operator:all" in internal_channels
    assert f"citizen:{reporter_id}" in internal_channels

    # 4. Operator incident detail exposes transcribed voice card and audio-only corroboratingVisual=False
    op_detail = await client.get(f"/api/v1/operator/incidents/{inc_id}", headers=operator_auth_headers)
    assert op_detail.status_code == status.HTTP_200_OK
    op_ev = op_detail.json()["evidence"]
    assert op_ev["voice"]["modelVersion"].startswith("faster-whisper-small-ct2")
    assert op_ev["voice"]["transcript"] == rep_db.raw_text
    assert op_ev["text"]["modelVersion"].startswith("muril-indian-emergency-v1-onnx")
    assert op_ev["corroboratingVisual"] is False


@pytest.mark.asyncio
async def test_live_triage_preview_and_non_fire_corroborating_visual_false(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    db_session: AsyncSession,
    monkeypatch,
):
    """
    Verifies /citizen/triage-preview with live MuRIL on Hinglish input AND ensures
    attaching a non-fire Indian traffic image produces corroboratingVisual=False.
    """
    from pathlib import Path
    from app.core.config import settings
    from app.modules.media.service import ensure_bucket_exists, get_s3_client

    monkeypatch.setattr(settings, "AI_ADAPTER_MODE", "live")
    repo_root = Path(__file__).resolve().parents[4]
    non_fire_img = (
        repo_root / "ml" / "vision_detector" / "datasets" / "raw" / "images" / "test_indian_neg" / "img_0906.jpg"
    )
    assert non_fire_img.is_file()

    # 1. Live triage preview with Hinglish waterlogging report
    preview_resp = await client.post(
        "/api/v1/citizen/triage-preview",
        json={"text": "Habibganj underpass me bahut paani bhar gaya hai scooty band ho gayi"},
        headers=citizen_auth_headers,
    )
    assert preview_resp.status_code == status.HTTP_200_OK
    preview_json = preview_resp.json()
    assert preview_json["suggestedCategory"] == "water_flood"
    assert preview_json["modelVersion"].startswith("muril-indian-emergency-v1-onnx")

    # 2. Report with non-fire road image -> FCOS returns no_supported_visual_evidence & corroboratingVisual=False
    ensure_bucket_exists()
    img_key = f"tests/live/{uuid.uuid4().hex}_traffic.jpg"
    get_s3_client(for_public_presign=False).put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=img_key,
        Body=non_fire_img.read_bytes(),
        ContentType="image/jpeg",
    )

    rep_resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Kolar road par do scooty takkar, traffic jam lag gaya",
            "location": {"lat": 23.2040, "lng": 77.4210},
            "locationLabel": "Kolar Road",
            "idempotencyKey": f"neg_vis_{uuid.uuid4().hex}",
        },
        headers=citizen_auth_headers,
    )
    assert rep_resp.status_code == status.HTTP_201_CREATED
    rep_id = uuid.UUID(rep_resp.json()["id"])
    inc_id = rep_resp.json()["incidentId"]

    db_session.add(
        MediaAsset(report_id=rep_id, file_type="image", file_name=non_fire_img.name, s3_key=img_key, mime_type="image/jpeg")
    )
    await db_session.commit()

    evidence = await execute_report_ai_pipeline(db_session, rep_id)
    assert evidence is not None
    assert evidence.vision is not None
    assert evidence.vision.adapter == "live_model"
    assert evidence.vision.finding == "no_supported_visual_evidence"
    assert evidence.corroboratingVisual is False

    op_detail = await client.get(f"/api/v1/operator/incidents/{inc_id}", headers=operator_auth_headers)
    assert op_detail.status_code == status.HTTP_200_OK
    op_ev = op_detail.json()["evidence"]
    assert op_ev["vision"]["finding"] == "no_supported_visual_evidence"
    assert op_ev["corroboratingVisual"] is False
