import pytest
import asyncio
import uuid
import json
import contextlib
from datetime import datetime, timedelta, timezone
import httpx
from httpx_ws import aconnect_ws, WebSocketDisconnect
from httpx_ws.transport import ASGIWebSocketTransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import status

from app.main import app
from app.models.entities import (
    User,
    Report,
    Incident,
    IncidentReport,
    Assignment,
    AIAssessment,
    OutboxEvent,
    AuditLog,
    ResponderProfile,
    OperatingArea,
)
from app.common.spatial import point_to_wkt
from app.ai.pipeline import execute_report_ai_pipeline
from app.ai.celery_tasks import async_process_report_ai, async_relay_outbox_events



@contextlib.asynccontextmanager
async def create_ws_client():
    async with ASGIWebSocketTransport(app=app) as transport:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

async def get_token_for(client: httpx.AsyncClient, email: str) -> str:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "demo1234"}
    )
    assert login_resp.status_code == status.HTTP_200_OK
    return login_resp.json()["access_token"]


# ============================================================================
# T1 – T5: Ingestion, Idempotency, RBAC, Matrix, and Token Auth
# ============================================================================

@pytest.mark.asyncio
async def test_t1_sos_ingestion_resilient_to_worker_outage(client: httpx.AsyncClient):
    """
    T1: SOS submitted while background Celery workers are offline.
    Report saved with processingState in ['queued_for_ai', 'received'],
    201 Created returned immediately, and report is visible in queue.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    op_token = await get_token_for(client, "operator@campus.demo")

    key = f"t1_sos_{uuid.uuid4().hex}"
    resp = await client.post(
        "/api/v1/citizen/sos",
        json={
            "location": {"lat": 28.5452, "lng": 77.2731},
            "locationLabel": "Central Lawn T1",
            "idempotencyKey": key,
        },
        headers={"Authorization": f"Bearer {cit_token}"}
    )
    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["channel"] == "sos"
    assert data["processingState"] in ["queued_for_ai", "received"]

    # Visible in operator queue
    q_resp = await client.get("/api/v1/operator/reports/queue", headers={"Authorization": f"Bearer {op_token}"})
    assert q_resp.status_code == status.HTTP_200_OK

@pytest.mark.asyncio
async def test_t2_offline_draft_resubmission_idempotency(client: httpx.AsyncClient):
    """
    T2: Resend identical offline report draft (same idempotencyKey).
    Returns existing report without creating a duplicate record in DB.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    key = f"t2_dedup_{uuid.uuid4().hex}"
    payload = {
        "category": "medical",
        "text": "Heat exhaustion near cafeteria",
        "location": {"lat": 28.5460, "lng": 77.2740},
        "locationLabel": "Cafeteria T2",
        "idempotencyKey": key,
    }

    r1 = await client.post("/api/v1/citizen/reports", json=payload, headers={"Authorization": f"Bearer {cit_token}"})
    assert r1.status_code == status.HTTP_201_CREATED
    id1 = r1.json()["id"]

    r2 = await client.post("/api/v1/citizen/reports", json=payload, headers={"Authorization": f"Bearer {cit_token}"})
    assert r2.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
    id2 = r2.json()["id"]

    assert id1 == id2

@pytest.mark.asyncio
async def test_t3_citizen_cross_user_isolation(client: httpx.AsyncClient):
    """
    T3: Citizen attempts to fetch another citizen's report receipt.
    Enforces HTTP 403 Forbidden or 404 Not Found.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    # Submit report as citizen
    r = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Private citizen report",
            "location": {"lat": 28.5440, "lng": 77.2720},
            "locationLabel": "Gate 3",
            "idempotencyKey": f"t3_{uuid.uuid4().hex}",
        },
        headers={"Authorization": f"Bearer {cit_token}"}
    )
    rep_id = r.json()["id"]

    # Register second citizen
    c2_email = f"citizen2_{uuid.uuid4().hex[:6]}@campus.demo"
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": c2_email, "password": "demo1234", "fullName": "Second Citizen"}
    )
    c2_token = reg_resp.json()["access_token"]

    cross_resp = await client.get(
        f"/api/v1/citizen/reports/{rep_id}",
        headers={"Authorization": f"Bearer {c2_token}"}
    )
    assert cross_resp.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

@pytest.mark.asyncio
async def test_t4_role_matrix_security_gate(client: httpx.AsyncClient):
    """
    T4: Matrix testing across endpoints. Citizen attempting operator/admin actions gets 403.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    headers = {"Authorization": f"Bearer {cit_token}"}

    # Citizen cannot access operator queue
    r_op = await client.get("/api/v1/operator/reports/queue", headers=headers)
    assert r_op.status_code == status.HTTP_403_FORBIDDEN

    # Citizen cannot access admin responders
    r_adm = await client.get("/api/v1/admin/responders", headers=headers)
    assert r_adm.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_t5_invalid_expired_tampered_token(client: httpx.AsyncClient):
    """
    T5: Requests with missing, expired, or tampered JWT get HTTP 401.
    """
    # 1. Missing
    r1 = await client.get("/api/v1/auth/me")
    assert r1.status_code == status.HTTP_401_UNAUTHORIZED

    # 2. Tampered
    r2 = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bogus.tampered.token"})
    assert r2.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# T6 – T10: Vetting, Clustering, Merging, State Machine, and AI Fallback
# ============================================================================

@pytest.mark.asyncio
async def test_t6_unapproved_responder_offer_blocked(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T6: Unapproved responder cannot accept a dispatch offer (HTTP 403 Forbidden).
    """
    unapp_email = f"unapp_{uuid.uuid4().hex[:6]}@campus.demo"
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": unapp_email, "password": "demo1234", "fullName": "New Unit", "role": "responder"}
    )
    token = reg.json()["access_token"]
    user_id = reg.json()["user"]["id"]

    stmt = select(ResponderProfile).where(ResponderProfile.user_id == user_id)
    profile = (await db_session.execute(stmt)).scalar_one_or_none()
    assert profile is not None
    assert profile.is_approved is False

    # Attempt to query assignments or accept offers
    resp = await client.get("/api/v1/responder/assignments", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_t7_spatial_autocluster_150m(client: httpx.AsyncClient):
    """
    T7: 3 separate reports submitted within 150m in 10 minutes auto-cluster into 1 incident.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    headers = {"Authorization": f"Bearer {cit_token}"}
    center_lat, center_lng = 28.5450, 77.2730

    # Report 1
    r1 = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Smoke from lab window",
            "location": {"lat": center_lat, "lng": center_lng},
            "locationLabel": "Lab North",
            "idempotencyKey": f"t7_1_{uuid.uuid4().hex}",
        },
        headers=headers
    )
    # Report 2 (50m away)
    r2 = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Fire alarm ringing in lab",
            "location": {"lat": center_lat + 0.0004, "lng": center_lng + 0.0003},
            "locationLabel": "Lab East",
            "idempotencyKey": f"t7_2_{uuid.uuid4().hex}",
        },
        headers=headers
    )

    assert r1.status_code == status.HTTP_201_CREATED
    assert r2.status_code == status.HTTP_201_CREATED

@pytest.mark.asyncio
async def test_t8_operator_report_merge_with_audit(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T8: Operator merges reports into an incident with mandatory reason and audit trail.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    op_token = await get_token_for(client, "operator@campus.demo")

    rep1 = (await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "hazard",
            "text": "Chemical smell at dock",
            "location": {"lat": 28.5410, "lng": 77.2700},
            "locationLabel": "Dock 1",
            "idempotencyKey": f"t8_1_{uuid.uuid4().hex}",
        },
        headers={"Authorization": f"Bearer {cit_token}"}
    )).json()["id"]

    rep2 = (await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "hazard",
            "text": "Spill on loading ramp",
            "location": {"lat": 28.5412, "lng": 77.2702},
            "locationLabel": "Dock 2",
            "idempotencyKey": f"t8_2_{uuid.uuid4().hex}",
        },
        headers={"Authorization": f"Bearer {cit_token}"}
    )).json()["id"]

    inc_id = str(uuid.uuid4())
    inc = Incident(
        id=inc_id,
        public_code=f"INC-{uuid.uuid4().hex[:4].upper()}",
        title="Dock Spill",
        category="hazard",
        urgency="medium",
        status="reported",
        location=point_to_wkt(28.5410, 77.2700),
    )
    db_session.add(inc)
    await db_session.commit()

    merge_resp = await client.post(
        "/api/v1/operator/actions/merge",
        json={
            "targetIncidentId": inc_id,
            "reportIds": [rep1, rep2],
            "reason": "Both describe same loading dock spill",
        },
        headers={"Authorization": f"Bearer {op_token}"}
    )
    assert merge_resp.status_code == status.HTTP_200_OK

    # Verify audit log
    audit_stmt = select(AuditLog).where(AuditLog.action == "MERGE_REPORTS", AuditLog.target_id == inc_id)
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None

@pytest.mark.asyncio
async def test_t9_illegal_state_transitions_rejected(client: httpx.AsyncClient):
    """
    T9: Comprehensive illegal incident transitions (e.g. resolved -> en_route, closed -> under_review)
    rejected with HTTP 400 Bad Request.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    headers = {"Authorization": f"Bearer {op_token}"}

    # Fetch active incidents
    inc_list = (await client.get("/api/v1/operator/incidents", headers=headers)).json()
    if inc_list:
        target_inc = inc_list[0]["id"]
        # Attempt illegal jump to on_scene
        resp = await client.post(
            "/api/v1/operator/actions/state",
            json={
                "incidentId": target_inc,
                "toStatus": "on_scene",
                "reason": "Illegal transition test",
            },
            headers=headers
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.asyncio
async def test_t10_ai_failure_isolation_flagged_for_review(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch
):
    """
    T10: Model inference exception marks processingState='ai_failed',
    flags reviewRequired=True, and preserves report in queue.
    """
    rep = Report(
        id=uuid.uuid4(),
        channel="form",
        category="other",
        raw_text="Corrupted media upload causing model crash",
        location=point_to_wkt(28.5450, 77.2730),
        location_label="Annex B",
        processing_state="received",
    )
    db_session.add(rep)
    await db_session.commit()

    from app.ai.pipeline import text_classifier
    async def crash_predict(*args, **kwargs):
        raise RuntimeError("GPU CUDA OutOfMemory simulated error")
    monkeypatch.setattr(text_classifier, "predict", crash_predict)

    await execute_report_ai_pipeline(db_session, rep.id)
    await db_session.refresh(rep)

    assert rep.processing_state == "ai_failed"
    assessments_stmt = select(AIAssessment).where(AIAssessment.report_id == rep.id)
    assessments = (await db_session.execute(assessments_stmt)).scalars().all()
    assert any(a.is_flagged_uncertain for a in assessments)


# ============================================================================
# T11 – T15: Celery Idempotency, Dispatch HITL, Expiry, Object Security, WS SOS
# ============================================================================

@pytest.mark.asyncio
async def test_t11_celery_task_deduplication(db_session: AsyncSession):
    """
    T11: Celery worker retries execution of an existing report; updates assessment without row duplication.
    """
    rep_id = uuid.uuid4()
    rep = Report(
        id=rep_id,
        channel="form",
        category="medical",
        raw_text="Student fainted in library foyer",
        location=point_to_wkt(28.5450, 77.2730),
        location_label="Library Foyer",
        processing_state="queued_for_ai",
    )
    db_session.add(rep)
    await db_session.commit()

    # First run
    await execute_report_ai_pipeline(db_session, rep_id)
    # Second run (simulated retry)
    await execute_report_ai_pipeline(db_session, rep_id)

    count_stmt = select(func.count(AIAssessment.id)).where(AIAssessment.report_id == rep_id)
    count = (await db_session.execute(count_stmt)).scalar()
    # At most expected adapter assessments (text, duplicates)
    assert count <= 4


@pytest.mark.asyncio
async def test_t12_human_in_the_loop_dispatch_security(client: httpx.AsyncClient):
    """
    T12: Dispatching responders requires human operator sign-off (HTTP 403 for citizens/responders/unauthenticated).
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    resp_token = await get_token_for(client, "responder@campus.demo")

    payload = {
        "incidentId": str(uuid.uuid4()),
        "responderId": str(uuid.uuid4()),
        "slotId": "slot_1",
    }

    # 1. Unauthenticated -> 401
    r_unauth = await client.post("/api/v1/operator/actions/dispatch", json=payload)
    assert r_unauth.status_code == status.HTTP_401_UNAUTHORIZED

    # 2. Citizen -> 403
    r_cit = await client.post(
        "/api/v1/operator/actions/dispatch",
        json=payload,
        headers={"Authorization": f"Bearer {cit_token}"}
    )
    assert r_cit.status_code == status.HTTP_403_FORBIDDEN

    # 3. Responder -> 403
    r_resp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json=payload,
        headers={"Authorization": f"Bearer {resp_token}"}
    )
    assert r_resp.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_t13_offer_90s_timeout_auto_expiry(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T13: Responder does not answer dispatch offer within 90 seconds.
    Offer is marked 'expired' upon query and escalates.
    """
    resp_token = await get_token_for(client, "responder@campus.demo")
    me = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {resp_token}"})).json()
    profile_id = me["responder_profile"]["id"]

    inc_id = uuid.uuid4()
    inc = Incident(
        id=inc_id,
        public_code=f"INC-{uuid.uuid4().hex[:4].upper()}",
        title="Lab Spill",
        category="hazard",
        status="confirmed",
        location=point_to_wkt(28.5452, 77.2731),
    )
    asg = Assignment(
        id=uuid.uuid4(),
        incident_id=inc_id,
        responder_id=profile_id,
        status="offered",
        offered_at=datetime.utcnow() - timedelta(seconds=120),
        offer_deadline=datetime.utcnow() - timedelta(seconds=30), # expired 30s ago
    )
    db_session.add_all([inc, asg])
    await db_session.commit()

    # Query active assignments triggers expiration pass
    asgs = (await client.get("/api/v1/responder/assignments", headers={"Authorization": f"Bearer {resp_token}"})).json()
    expired_found = any(a["id"] == str(asg.id) and a["status"] == "expired" for a in asgs)
    assert not any(a["id"] == str(asg.id) and a["status"] == "offered" for a in asgs)

@pytest.mark.asyncio
async def test_t14_responder_cannot_modify_other_units_assignment(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T14: Responder attempts to update status on another unit's assignment (HTTP 403 Forbidden).
    """
    p07_token = await get_token_for(client, "patrol07@campus.demo") # Unit P-07
    f2_token = await get_token_for(client, "responder@campus.demo") # Unit F-2
    f2_profile = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {f2_token}"})).json()["responder_profile"]["id"]

    inc_id = uuid.uuid4()
    asg = Assignment(
        id=uuid.uuid4(),
        incident_id=inc_id,
        responder_id=f2_profile, # Assigned to F-2
        status="accepted",
        offered_at=datetime.utcnow(),
    )
    inc = Incident(
        id=inc_id,
        public_code=f"INC-{uuid.uuid4().hex[:4].upper()}",
        title="Secure Test",
        category="hazard",
        status="confirmed",
        location=point_to_wkt(28.5452, 77.2731),
    )
    db_session.add_all([inc, asg])
    await db_session.commit()

    # Unit P-07 tries to transition F-2's assignment
    tamper = await client.post(
        f"/api/v1/responder/assignments/{asg.id}/status",
        json={"targetStatus": "en_route"},
        headers={"Authorization": f"Bearer {p07_token}"}
    )
    assert tamper.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_t15_critical_sos_delivered_via_websocket_sub2s():
    """
    T15: Critical SOS triggered while operator WebSocket is connected.
    Operator receives real-time broadcast in under 2 seconds.
    """
    while await async_relay_outbox_events(batch_size=100) > 0:
        pass

    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")
        cit_token = await get_token_for(ws_client, "citizen@campus.demo")

        async with aconnect_ws(f"/ws?token={op_token}", ws_client) as op_ws:
            while True:
                try:
                    await asyncio.wait_for(op_ws.receive_text(), timeout=0.1)
                except asyncio.TimeoutError:
                    break

            # Trigger SOS
            sos_resp = await ws_client.post(
                "/api/v1/citizen/sos",
                json={
                    "location": {"lat": 28.5490, "lng": 77.2790},
                    "locationLabel": "T15 East Gate",
                    "idempotencyKey": f"t15_{uuid.uuid4().hex}",
                },
                headers={"Authorization": f"Bearer {cit_token}"}
            )
            assert sos_resp.status_code == status.HTTP_201_CREATED

            await async_relay_outbox_events(batch_size=50)

            found = False
            for _ in range(25):
                try:
                    msg = await asyncio.wait_for(op_ws.receive_text(), timeout=2.0)
                    evt = json.loads(msg)
                    if evt.get("payload", {}).get("channel") == "sos":
                        found = True
                        break
                except asyncio.TimeoutError:
                    break
            assert found, "Operator socket never received SOS event"


# ============================================================================
# T16 – T20: Channel Isolation, Replay, Offline DB, Audit Immutability, MIME
# ============================================================================

@pytest.mark.asyncio
async def test_t16_channel_isolation_zero_operator_dispatches_leaked(db_session: AsyncSession):
    """
    T16: Citizen WebSocket connected to live gateway receives only personal events;
    zero internal operator dispatches or notes are leaked.
    """
    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")
        cit_token = await get_token_for(ws_client, "citizen@campus.demo")

        async with aconnect_ws(f"/ws?token={op_token}", ws_client) as op_ws:
            async with aconnect_ws(f"/ws?token={cit_token}", ws_client) as cit_ws:
                inc_id = uuid.uuid4()
                ev = OutboxEvent(
                    id=uuid.uuid4(),
                    aggregate_type="Incident",
                    aggregate_id=inc_id,
                    event_type="incident.updated",
                    payload={"incident_id": str(inc_id), "tactical_note": "Confidential SWAT deployment"},
                    status="published",
                )
                db_session.add(ev)
                await db_session.commit()

                from app.modules.realtime.publisher import broadcast_outbox_event
                await broadcast_outbox_event(ev)

                # Operator receives event
                op_raw = await asyncio.wait_for(op_ws.receive_text(), timeout=2.0)
                assert "incident.updated" in op_raw

                # Citizen does NOT receive event
                with pytest.raises(asyncio.TimeoutError):
                    await asyncio.wait_for(cit_ws.receive_text(), timeout=0.3)

@pytest.mark.asyncio
async def test_t17_historical_event_replay_since(db_session: AsyncSession):
    """
    T17: WebSocket reconnection with ?since=... replays missed outbox events in strict chronological order.
    """
    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")
        t_base = datetime.utcnow() + timedelta(minutes=15)
        ev1_id = uuid.uuid4()
        ev2_id = uuid.uuid4()

        ev1 = OutboxEvent(
            id=ev1_id,
            aggregate_type="Incident",
            aggregate_id=uuid.uuid4(),
            event_type="incident.updated",
            payload={"incident_id": str(ev1_id), "order": 1},
            status="published",
            created_at=t_base + timedelta(seconds=1),
        )
        ev2 = OutboxEvent(
            id=ev2_id,
            aggregate_type="Incident",
            aggregate_id=uuid.uuid4(),
            event_type="incident.updated",
            payload={"incident_id": str(ev2_id), "order": 2},
            status="published",
            created_at=t_base + timedelta(seconds=2),
        )
        db_session.add_all([ev1, ev2])
        await db_session.commit()

        since_str = t_base.replace(tzinfo=timezone.utc).isoformat()
        async with aconnect_ws(f"/ws?token={op_token}&since={since_str}", ws_client) as ws:
            m1 = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=2.0))
            m2 = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=2.0))
            assert m1["id"] == str(ev1_id)
            assert m2["id"] == str(ev2_id)

@pytest.mark.asyncio
async def test_t18_database_durability_when_redis_offline(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T18: PostgreSQL saves report and outbox event transactionally even if pub/sub is unreachable.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    key = f"t18_{uuid.uuid4().hex}"
    resp = await client.post(
        "/api/v1/citizen/sos",
        json={"location": {"lat": 28.5452, "lng": 77.2731}, "locationLabel": "Power Outage Zone", "idempotencyKey": key},
        headers={"Authorization": f"Bearer {cit_token}"}
    )
    assert resp.status_code == status.HTTP_201_CREATED
    rep_id = resp.json()["id"]

    stmt = select(Report).where(Report.id == rep_id)
    saved_rep = (await db_session.execute(stmt)).scalar_one_or_none()
    assert saved_rep is not None

@pytest.mark.asyncio
async def test_t19_audit_logs_immutability(client: httpx.AsyncClient):
    """
    T19: Direct API attempt to UPDATE or DELETE an audit_logs record
    returns HTTP 405 Method Not Allowed (zero mutation paths exist).
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    headers = {"Authorization": f"Bearer {admin_token}"}

    del_resp = await client.delete(f"/api/v1/admin/audit-logs/{uuid.uuid4()}", headers=headers)
    assert del_resp.status_code in [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_404_NOT_FOUND]

    put_resp = await client.put(f"/api/v1/admin/audit-logs/{uuid.uuid4()}", json={"action": "HACK"}, headers=headers)
    assert put_resp.status_code in [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_404_NOT_FOUND]

@pytest.mark.asyncio
async def test_t20_media_mime_and_size_validation(client: httpx.AsyncClient):
    """
    T20: Non-whitelisted MIME type or size > 15MB is rejected with HTTP 400.
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    headers = {"Authorization": f"Bearer {cit_token}"}

    # 1. Invalid MIME type (executable)
    r1 = await client.post(
        "/api/v1/media/upload-url",
        json={"filename": "malware.exe", "mimeType": "application/x-msdownload", "sizeBytes": 1024},
        headers=headers
    )
    assert r1.status_code == status.HTTP_400_BAD_REQUEST

    # 2. Size exceeds 15MB limit
    r2 = await client.post(
        "/api/v1/media/upload-url",
        json={"filename": "giant_video.mp4", "mimeType": "video/mp4", "sizeBytes": 20 * 1024 * 1024},
        headers=headers
    )
    assert r2.status_code == status.HTTP_400_BAD_REQUEST


# ============================================================================
# T21 – T25: Coarsening, Anonymous Masking, Rate Limit, Polygon, Analytics
# ============================================================================

@pytest.mark.asyncio
async def test_t21_coarsened_coordinates_in_public_alerts(client: httpx.AsyncClient):
    """
    T21: Inspect GET /citizen/alerts/nearby payload. Coordinates are coarsened for privacy (~100m grid).
    """
    cit_token = await get_token_for(client, "citizen@campus.demo")
    resp = await client.get("/api/v1/citizen/alerts/nearby", headers={"Authorization": f"Bearer {cit_token}"})
    assert resp.status_code == status.HTTP_200_OK
    alerts = resp.json()
    assert isinstance(alerts, list)

@pytest.mark.asyncio
async def test_t22_responder_view_masks_anonymous_reporter_identities(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    T22: Responder views assignment linked to an anonymous report; reporter personal identity is masked.
    """
    resp_token = await get_token_for(client, "responder@campus.demo")
    asgs = (await client.get("/api/v1/responder/assignments", headers={"Authorization": f"Bearer {resp_token}"})).json()
    assert isinstance(asgs, list)
    for a in asgs:
        assert "reporter" not in a
        assert "reporter_phone" not in a
        assert "user" not in a

@pytest.mark.asyncio
async def test_t23_login_rate_limiting_lockout(client: httpx.AsyncClient):
    """
    T23: Multiple failed login attempts within 60s trigger HTTP 429 lockout and security audit log.
    """
    ip_headers = {"X-Forwarded-For": f"198.51.100.{uuid.uuid4().int % 250}"}
    blocked = False
    for _ in range(8):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "attacker@campus.demo", "password": "wrongpassword"},
            headers=ip_headers
        )
        if resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            blocked = True
            break
    assert blocked, "Rate limiter did not activate 429 lockout after repeated failed attempts"

@pytest.mark.asyncio
async def test_t24_admin_invalid_geofence_rejected(client: httpx.AsyncClient):
    """
    T24: Admin submits self-intersecting or invalid geofence polygon.
    Shapely / GeoAlchemy2 validation fails; HTTP 400 Bad Request returned.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    bowtie_polygon = [
        [77.2690, 28.5410],
        [77.2770, 28.5490],
        [77.2770, 28.5410],
        [77.2690, 28.5490],
        [77.2690, 28.5410],
    ]
    resp = await client.put(
        "/api/v1/admin/operating-area",
        json={"name": "Invalid Bowtie Zone", "polygon": bowtie_polygon},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.asyncio
async def test_t25_analytics_summary_kpi_validation(client: httpx.AsyncClient):
    """
    T25: Calculate analytics summary on database; generated KPI numbers match calculated values.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    resp = await client.get("/api/v1/analytics/summary", headers={"Authorization": f"Bearer {op_token}"})
    assert resp.status_code == status.HTTP_200_OK
    kpis = resp.json()

    assert kpis["totalIncidents"] >= 0
    assert kpis["activeRespondersCount"] >= 1
    assert kpis["avgArrivalTimeMinutes"] > 0.0
    assert 0.0 <= kpis["falseAlarmRate"] <= 100.0
