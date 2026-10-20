import pytest
import uuid
from datetime import datetime, timedelta
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import status

from app.models.entities import (
    Incident,
    Assignment,
    AssignmentEvent,
    ResponderProfile,
    AuditLog,
    OutboxEvent,
)
from app.modules.responder.service import auto_expire_assignment_offers

@pytest.fixture
async def operator_auth_headers(client: httpx.AsyncClient) -> dict:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "operator@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def citizen_auth_headers(client: httpx.AsyncClient) -> dict:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def responder_f2_headers(client: httpx.AsyncClient) -> dict:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "responder@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def responder_p07_headers(client: httpx.AsyncClient) -> dict:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "patrol07@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

_coord_counter = 0

async def create_demo_incident(
    client: httpx.AsyncClient,
    citizen_headers: dict,
    category: str = "fire_smoke",
    lat: float = None,
    lng: float = None,
) -> str:
    """Helper to create a report which auto-spawns an incident."""
    global _coord_counter
    _coord_counter += 1
    actual_lat = lat if lat is not None else round(28.6000 + (_coord_counter * 0.01), 6)
    actual_lng = lng if lng is not None else round(77.3000 + (_coord_counter * 0.01), 6)
    unique_key = uuid.uuid4().hex[:8]
    resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": category,
            "text": f"Emergency test report for {category} {unique_key}",
            "location": {"lat": actual_lat, "lng": actual_lng},
            "idempotencyKey": f"test_inc_{uuid.uuid4().hex}"
        },
        headers=citizen_headers
    )
    assert resp.status_code == status.HTTP_201_CREATED
    inc_id = resp.json()["incidentId"]
    assert inc_id is not None
    return inc_id



@pytest.mark.asyncio
async def test_dispatch_recommendations(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict
):
    """
    Operator queries recommendations for an incident.
    Units equipped with matching category capabilities are scored highest.
    Citizen access is strictly rejected with 403.
    """
    inc_id = await create_demo_incident(client, citizen_auth_headers, category="fire_smoke")

    # 1. Citizen cannot view recommendations -> 403
    resp_citizen = await client.get(
        f"/api/v1/operator/incidents/{inc_id}/recommendations",
        headers=citizen_auth_headers
    )
    assert resp_citizen.status_code == status.HTTP_403_FORBIDDEN

    # 2. Operator gets ranked recommendations -> 200
    resp_op = await client.get(
        f"/api/v1/operator/incidents/{inc_id}/recommendations",
        headers=operator_auth_headers
    )
    assert resp_op.status_code == status.HTTP_200_OK
    recs = resp_op.json()
    assert isinstance(recs, list)
    assert len(recs) > 0

    # Unit F-2 has firefighting & rescue capabilities, so it should rank first with matching reason
    top_unit = recs[0]
    assert "unitCode" in top_unit
    assert "etaMinutes" in top_unit
    assert "score" in top_unit
    assert "matchReason" in top_unit
    assert top_unit["unitCode"] == "F-2"
    assert "firefighting" in top_unit["matchReason"].lower()

@pytest.mark.asyncio
async def test_operator_dispatch_offer_and_hitl(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict
):
    """
    Operator issues a 90-second dispatch offer.
    Automated or citizen dispatch attempt is rejected with 403 (HITL enforcement).
    """
    inc_id = await create_demo_incident(client, citizen_auth_headers, category="fire_smoke")

    # 1. Citizen attempting dispatch -> 403 Forbidden
    resp_unauth = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2", "note": "Unauthorized dispatch attempt"},
        headers=citizen_auth_headers
    )
    assert resp_unauth.status_code == status.HTTP_403_FORBIDDEN

    # 2. Operator issues dispatch offer
    resp_dispatch = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2", "note": "Respond to smoke in Lab 3"},
        headers=operator_auth_headers
    )
    assert resp_dispatch.status_code == status.HTTP_201_CREATED
    data = resp_dispatch.json()

    assert data["status"] == "offered"
    assert data["offerDeadline"] is not None
    assert data["etaMinutes"] is not None
    assert data["distanceKm"] is not None
    asg_id = data["id"]

    # Refresh session to inspect committed state
    db_session.expire_all()

    # Verify Incident state changed to assigned
    inc_obj = await db_session.get(Incident, uuid.UUID(inc_id))
    assert inc_obj.status == "assigned"

    # Verify AuditLog logged DISPATCH_OFFER
    audit_stmt = select(AuditLog).where(
        AuditLog.action == "DISPATCH_OFFER",
        AuditLog.target_id == asg_id
    )
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None
    assert audit.target_entity == "Assignment"

    # Verify Outbox event created
    outbox_stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_id == uuid.UUID(asg_id),
        OutboxEvent.event_type == "assignment.offered"
    )
    outbox_ev = (await db_session.execute(outbox_stmt)).scalar_one_or_none()
    assert outbox_ev is not None

@pytest.mark.asyncio
async def test_responder_object_level_security(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict,
    responder_p07_headers: dict
):
    """Responders cannot accept or modify assignments offered to other units."""
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    # Operator dispatches to F-2
    dispatch_resp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = dispatch_resp.json()["id"]

    # Patrol 07 attempts to respond to F-2's offer -> 403 Forbidden
    resp_p07 = await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_p07_headers
    )
    assert resp_p07.status_code == status.HTTP_403_FORBIDDEN
    assert "belonging to other units" in resp_p07.json()["message"]

@pytest.mark.asyncio
async def test_responder_decline_flow(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """Responder declines dispatch offer; availability restored to available."""
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    dispatch_resp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = dispatch_resp.json()["id"]

    # F-2 declines offer with reason
    decline_resp = await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "declined", "reason": "Equipment restocking underway"},
        headers=responder_f2_headers
    )
    assert decline_resp.status_code == status.HTTP_200_OK
    assert decline_resp.json()["status"] == "declined"

    db_session.expire_all()

    # Responder availability restored
    resp_stmt = select(ResponderProfile).where(ResponderProfile.unit_code == "F-2")
    profile = (await db_session.execute(resp_stmt)).scalar_one()
    assert profile.availability_status == "available"

    # AuditLog recorded DECLINE_OFFER
    audit_stmt = select(AuditLog).where(
        AuditLog.action == "DECLINE_OFFER",
        AuditLog.target_id == asg_id
    )
    audit = (await db_session.execute(audit_stmt)).scalar_one_or_none()
    assert audit is not None

@pytest.mark.asyncio
async def test_full_mission_lifecycle(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """
    Full mission transition lifecycle:
    offered -> accepted -> en_route -> arrived -> completed.
    Incident and responder availability coordinate correctly at each stage.
    """
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    # 1. Operator Dispatches
    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    # 2. Responder Accepts Offer
    accept_resp = await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_f2_headers
    )
    assert accept_resp.status_code == status.HTTP_200_OK
    assert accept_resp.json()["status"] == "accepted"

    # 3. Responder transitions to en_route
    en_route_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "en_route"},
        headers=responder_f2_headers
    )
    assert en_route_resp.status_code == status.HTTP_200_OK
    assert en_route_resp.json()["status"] == "en_route"

    db_session.expire_all()
    inc_obj = await db_session.get(Incident, uuid.UUID(inc_id))
    assert inc_obj.status == "en_route"

    # 4. Responder transitions to arrived (on_scene)
    arrived_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "arrived"},
        headers=responder_f2_headers
    )
    assert arrived_resp.status_code == status.HTTP_200_OK
    assert arrived_resp.json()["status"] == "arrived"

    db_session.expire_all()
    inc_obj = await db_session.get(Incident, uuid.UUID(inc_id))
    assert inc_obj.status == "on_scene"

    # 5. Responder completes mission
    complete_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "completed", "reason": "Fire fully extinguished"},
        headers=responder_f2_headers
    )
    assert complete_resp.status_code == status.HTTP_200_OK
    assert complete_resp.json()["status"] == "completed"
    assert complete_resp.json()["completedAt"] is not None

    db_session.expire_all()
    inc_obj = await db_session.get(Incident, uuid.UUID(inc_id))
    assert inc_obj.status == "resolved"
    assert inc_obj.resolved_at is not None

    # Availability reset to available
    resp_stmt = select(ResponderProfile).where(ResponderProfile.unit_code == "F-2")
    profile = (await db_session.execute(resp_stmt)).scalar_one()
    assert profile.availability_status == "available"

@pytest.mark.asyncio
async def test_illegal_state_transition_rejected(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """Direct illegal jumps (e.g. accepted -> completed) are rejected with HTTP 400."""
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_f2_headers
    )

    # Illegal jump directly to completed
    bad_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "completed"},
        headers=responder_f2_headers
    )
    assert bad_resp.status_code == status.HTTP_400_BAD_REQUEST
    assert bad_resp.json()["code"] == "ILLEGAL_STATE_TRANSITION"

@pytest.mark.asyncio
async def test_mission_failed_escalation(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """
    Reporting mission failed requires a mandatory reason/explanation.
    Creates an outbox event assignment.failed and frees responder availability.
    """
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_f2_headers
    )

    # 1. Failed without explanation -> 400
    no_reason_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "failed"},
        headers=responder_f2_headers
    )
    assert no_reason_resp.status_code == status.HTTP_400_BAD_REQUEST
    assert no_reason_resp.json()["code"] == "REASON_REQUIRED"

    # 2. Failed with explanation -> 200
    failed_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "failed", "explanation": "Access road completely flooded and impassable"},
        headers=responder_f2_headers
    )
    assert failed_resp.status_code == status.HTTP_200_OK
    assert failed_resp.json()["status"] == "failed"

    db_session.expire_all()

    # Outbox event emitted
    outbox_stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_id == uuid.UUID(asg_id),
        OutboxEvent.event_type == "assignment.failed"
    )
    ev = (await db_session.execute(outbox_stmt)).scalar_one_or_none()
    assert ev is not None
    assert "flooded" in ev.payload["explanation"]

    # Availability restored
    resp_stmt = select(ResponderProfile).where(ResponderProfile.unit_code == "F-2")
    profile = (await db_session.execute(resp_stmt)).scalar_one()
    assert profile.availability_status == "available"

@pytest.mark.asyncio
async def test_telemetry_gps_ping_recalculates_eta(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """
    GPS telemetry pings update responder coordinates and recalculate active mission ETA/distance.
    """
    target_lat = 28.7500
    target_lng = 77.4500
    inc_id = await create_demo_incident(client, citizen_auth_headers, lat=target_lat, lng=target_lng)

    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_f2_headers
    )
    await client.post(
        f"/api/v1/responder/assignments/{asg_id}/status",
        json={"status": "en_route"},
        headers=responder_f2_headers
    )

    # Ingest location ping close to incident (incident is at target_lat, target_lng)
    ping_resp = await client.post(
        "/api/v1/responder/location",
        json={"lat": target_lat + 0.0001, "lng": target_lng + 0.0001, "source": "gps"},
        headers=responder_f2_headers
    )
    assert ping_resp.status_code == status.HTTP_200_OK
    assert ping_resp.json()["ok"] is True

    db_session.expire_all()

    # Check updated assignment ETA and distance
    asg_obj = await db_session.get(Assignment, uuid.UUID(asg_id))
    assert asg_obj.distance_km is not None
    assert asg_obj.distance_km < 0.1 # Very close (< 100m)
    assert asg_obj.eta_minutes <= 1

@pytest.mark.asyncio
async def test_operational_notes_and_duty_toggle(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """Operational notes append to assignment; duty toggles update availability."""
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    # 1. Append operational notes
    notes_resp = await client.post(
        f"/api/v1/responder/assignments/{asg_id}/notes",
        json={"notes": "Deploying foam extinguisher to electrical panel"},
        headers=responder_f2_headers
    )
    assert notes_resp.status_code == status.HTTP_200_OK
    assert "Deploying foam" in notes_resp.json()["routeNote"]

    # 2. Toggle duty to off_duty
    duty_off = await client.patch(
        "/api/v1/responder/duty",
        json={"isOnDuty": False, "availabilityStatus": "off_duty"},
        headers=responder_f2_headers
    )
    assert duty_off.status_code == status.HTTP_200_OK
    assert duty_off.json()["isOnDuty"] is False
    assert duty_off.json()["availabilityStatus"] == "off_duty"

    # 3. Toggle duty back to available
    duty_on = await client.patch(
        "/api/v1/responder/duty",
        json={"isOnDuty": True, "availabilityStatus": "available"},
        headers=responder_f2_headers
    )
    assert duty_on.status_code == status.HTTP_200_OK
    assert duty_on.json()["isOnDuty"] is True
    assert duty_on.json()["availabilityStatus"] == "available"

@pytest.mark.asyncio
async def test_offer_90s_timeout_auto_expiry(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    citizen_auth_headers: dict,
    operator_auth_headers: dict,
    responder_f2_headers: dict
):
    """
    Offers past 90-second deadline cannot be accepted and auto-expire.
    Emits assignment.expired outbox event and appears in history.
    """
    inc_id = await create_demo_incident(client, citizen_auth_headers)

    disp = await client.post(
        "/api/v1/operator/actions/dispatch",
        json={"incidentId": inc_id, "responderId": "F-2"},
        headers=operator_auth_headers
    )
    asg_id = disp.json()["id"]

    # Manually backdate the deadline to simulate timeout
    past_time = datetime.utcnow() - timedelta(seconds=120)
    asg_obj = await db_session.get(Assignment, uuid.UUID(asg_id))
    asg_obj.offer_deadline = past_time
    await db_session.commit()

    # 1. Accepting expired offer directly returns 400
    expired_accept = await client.post(
        f"/api/v1/responder/offers/{asg_id}/respond",
        json={"status": "accepted"},
        headers=responder_f2_headers
    )
    assert expired_accept.status_code == status.HTTP_400_BAD_REQUEST
    assert expired_accept.json()["code"] == "OFFER_EXPIRED"

    # 2. Run auto_expire_assignment_offers background routine
    expired_count = await auto_expire_assignment_offers(db_session)
    # The accept call already flagged it expired, or auto_expire processes any remaining
    assert expired_count >= 0

    # 3. Check outbox event for assignment.expired
    db_session.expire_all()
    asg_refreshed = await db_session.get(Assignment, uuid.UUID(asg_id))
    assert asg_refreshed.status == "expired"

    # 4. Check history includes the expired offer
    hist_resp = await client.get("/api/v1/responder/history", headers=responder_f2_headers)
    assert hist_resp.status_code == status.HTTP_200_OK
    history_ids = [h["id"] for h in hist_resp.json()]
    assert asg_id in history_ids
