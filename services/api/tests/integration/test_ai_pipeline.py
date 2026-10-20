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
        public_code=f"AI-{uuid.uuid4().hex[:3].upper()}",
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
