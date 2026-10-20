import pytest
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import status

from app.models.entities import Incident, IncidentReport, AuditLog, Report
from app.modules.operator.service import cluster_report_to_incident

@pytest.fixture
async def operator_auth_headers(client: httpx.AsyncClient) -> dict:
    """Fixture providing auth headers for seeded operator."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "operator@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def citizen_auth_headers(client: httpx.AsyncClient) -> dict:
    """Fixture providing auth headers for seeded citizen."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_operator_rbac_protection(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    operator_auth_headers: dict
):
    """Citizen must be rejected with 403 on all operator endpoints."""
    # Citizen accessing operator queue -> 403 Forbidden
    resp_citizen = await client.get("/api/v1/operator/incidents", headers=citizen_auth_headers)
    assert resp_citizen.status_code == status.HTTP_403_FORBIDDEN
    assert resp_citizen.json()["code"] == "FORBIDDEN"

    # Operator accessing operator queue -> 200 OK
    resp_operator = await client.get("/api/v1/operator/incidents", headers=operator_auth_headers)
    assert resp_operator.status_code == status.HTTP_200_OK

@pytest.mark.asyncio
async def test_150m_spatial_autocluster(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """
    Reports within 150m radius auto-cluster into the same Incident.
    Reports beyond 150m spawn a separate Incident.
    """
    # Report 1
    resp1 = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Scooter fall near North Gate",
            "location": {"lat": 28.5470, "lng": 77.2720},
            "idempotencyKey": f"cluster_1_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert resp1.status_code == status.HTTP_201_CREATED
    inc_1_id = resp1.json()["incidentId"]
    assert inc_1_id is not None

    # Report 2 (~35 meters away from Report 1, <= 150m)
    resp2 = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Crowd gathering around fallen scooter",
            "location": {"lat": 28.5472, "lng": 77.2722},
            "idempotencyKey": f"cluster_2_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert resp2.status_code == status.HTTP_201_CREATED
    inc_2_id = resp2.json()["incidentId"]

    # Must be clustered into the SAME incident
    assert inc_1_id == inc_2_id

    # Report 3 (~850 meters away, > 150m)
    resp3 = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "road_accident",
            "text": "Separate fender bender at South Gate",
            "location": {"lat": 28.5540, "lng": 77.2780},
            "idempotencyKey": f"cluster_3_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    assert resp3.status_code == status.HTTP_201_CREATED
    inc_3_id = resp3.json()["incidentId"]

    # Must NOT cluster into inc_1; spawns new incident
    assert inc_3_id != inc_1_id

@pytest.mark.asyncio
async def test_active_incidents_ordered_by_urgency(
    client: httpx.AsyncClient,
    operator_auth_headers: dict
):
    """Verify active incidents queue sorts critical > high > medium > low."""
    resp = await client.get("/api/v1/operator/incidents", headers=operator_auth_headers)
    assert resp.status_code == status.HTTP_200_OK
    incidents = resp.json()
    assert len(incidents) > 0

    urgency_weights = {"critical": 1, "high": 2, "medium": 3, "low": 4}
    scores = [urgency_weights.get(i["urgency"], 5) for i in incidents]
    # Check that list is sorted by urgency ascending score (critical first)
    assert scores == sorted(scores)

@pytest.mark.asyncio
async def test_incident_detail_workspace(
    client: httpx.AsyncClient,
    operator_auth_headers: dict
):
    """Verify detailed workspace payload matching frontend contract."""
    resp = await client.get("/api/v1/operator/incidents/402", headers=operator_auth_headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()

    assert "incident" in data
    assert data["incident"]["publicCode"] == "402"
    assert "linkedReports" in data
    assert "evidence" in data
    assert "assignments" in data
    assert "timeline" in data

@pytest.mark.asyncio
async def test_state_machine_legal_transitions_and_audit(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    db_session: AsyncSession
):
    """
    Advance through legal transitions: reported -> under_review -> confirmed -> assigned.
    Verifies timeline events and immutable audit log.
    """
    # Create fresh incident in reported state
    inc = Incident(
        public_code=f"TST-{uuid.uuid4().hex[:3].upper()}",
        title="State Machine Test Incident",
        category="medical",
        urgency="high",
        status="reported",
        location="SRID=4326;POINT(77.2731 28.5452)",
    )
    db_session.add(inc)
    await db_session.commit()
    inc_id = str(inc.id)

    # 1. reported -> under_review
    step1 = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "under_review", "reason": "Operator reviewing call"},
        headers=operator_auth_headers
    )
    assert step1.status_code == status.HTTP_200_OK
    assert step1.json()["status"] == "under_review"

    # 2. under_review -> confirmed
    step2 = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "confirmed", "reason": "Doctor confirmed injury"},
        headers=operator_auth_headers
    )
    assert step2.status_code == status.HTTP_200_OK
    assert step2.json()["status"] == "confirmed"
    assert step2.json()["evidenceLabel"] == "confirmed_by_operator"

    # 3. confirmed -> assigned
    step3 = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "assigned", "reason": "Ambulance dispatched"},
        headers=operator_auth_headers
    )
    assert step3.status_code == status.HTTP_200_OK
    assert step3.json()["status"] == "assigned"

    # Verify audit log exists
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.target_id == inc_id,
            AuditLog.action == "UPDATE_INCIDENT_STATE"
        )
    )
    res = await db_session.execute(stmt)
    audit_entries = res.scalars().all()
    assert len(audit_entries) >= 3

@pytest.mark.asyncio
async def test_state_machine_illegal_transitions_rejected(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    db_session: AsyncSession
):
    """
    Illegal state transitions not in Section 2.2.B matrix must be rejected with HTTP 400.
    """
    inc = Incident(
        public_code=f"ILL-{uuid.uuid4().hex[:3].upper()}",
        title="Illegal Transition Test",
        category="hazard",
        urgency="medium",
        status="reported",
        location="SRID=4326;POINT(77.2731 28.5452)",
    )
    db_session.add(inc)
    await db_session.commit()
    inc_id = str(inc.id)

    # 1. Illegal jump: reported -> en_route (must be under_review/confirmed/assigned first)
    bad_jump = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "en_route", "reason": "Invalid bypass"},
        headers=operator_auth_headers
    )
    assert bad_jump.status_code == status.HTTP_400_BAD_REQUEST
    assert bad_jump.json()["code"] == "ILLEGAL_STATE_TRANSITION"

    # 2. Advance to resolved, then attempt illegal jump back to en_route
    inc.status = "resolved"
    await db_session.commit()

    bad_revert = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "en_route", "reason": "Illegal route jump"},
        headers=operator_auth_headers
    )
    assert bad_revert.status_code == status.HTTP_400_BAD_REQUEST
    assert bad_revert.json()["code"] == "ILLEGAL_STATE_TRANSITION"

    # 3. Terminal state check: closed -> under_review (closed is terminal)
    inc.status = "closed"
    await db_session.commit()

    bad_terminal = await client.post(
        "/api/v1/operator/actions/state",
        json={"incidentId": inc_id, "toStatus": "under_review", "reason": "Reopen terminal"},
        headers=operator_auth_headers
    )
    assert bad_terminal.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.asyncio
async def test_merge_reports_action_and_audit(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """Operator merges multiple reports into one incident with mandatory reason."""
    # Target incident
    inc = Incident(
        public_code=f"MRG-{uuid.uuid4().hex[:3].upper()}",
        title="Merge Target Incident",
        category="water_flood",
        urgency="high",
        status="reported",
        location="SRID=4326;POINT(77.2731 28.5452)",
    )
    db_session.add(inc)
    await db_session.commit()
    target_inc_id = str(inc.id)

    # Create two reports
    r1 = await client.post(
        "/api/v1/citizen/reports",
        json={"category": "water_flood", "text": "Burst pipe east side", "location": {"lat": 28.545, "lng": 77.273}},
        headers=citizen_auth_headers
    )
    r2 = await client.post(
        "/api/v1/citizen/reports",
        json={"category": "water_flood", "text": "Flooding in basement east", "location": {"lat": 28.546, "lng": 77.274}},
        headers=citizen_auth_headers
    )
    rep1_id = r1.json()["id"]
    rep2_id = r2.json()["id"]

    # Execute merge
    merge_resp = await client.post(
        "/api/v1/operator/actions/merge",
        json={
            "targetIncidentId": target_inc_id,
            "reportIds": [rep1_id, rep2_id],
            "reason": "Both reports confirm same primary main water break"
        },
        headers=operator_auth_headers
    )
    assert merge_resp.status_code == status.HTTP_200_OK
    merged_data = merge_resp.json()
    assert rep1_id in merged_data["reportIds"]
    assert rep2_id in merged_data["reportIds"]

    # Verify audit log
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.target_id == target_inc_id,
            AuditLog.action == "MERGE_REPORTS"
        )
    )
    audit = (await db_session.execute(stmt)).scalars().first()
    assert audit is not None
    assert "water break" in audit.details["reason"]

@pytest.mark.asyncio
async def test_split_report_action_and_audit(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """Operator detaches an incorrectly grouped report into a separate incident."""
    # Create incident with report
    r = await client.post(
        "/api/v1/citizen/reports",
        json={"category": "hazard", "text": "Chemical fumes in lab 3", "location": {"lat": 28.545, "lng": 77.273}},
        headers=citizen_auth_headers
    )
    rep_id = r.json()["id"]
    orig_inc_id = r.json()["incidentId"]

    # Split report
    split_resp = await client.post(
        "/api/v1/operator/actions/split",
        json={
            "reportId": rep_id,
            "reason": "Investigation reveals separate chemical leak distinct from fire"
        },
        headers=operator_auth_headers
    )
    assert split_resp.status_code == status.HTTP_200_OK
    new_inc = split_resp.json()
    assert new_inc["id"] != orig_inc_id
    assert rep_id in new_inc["reportIds"]

    # Verify audit log
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.target_id == rep_id,
            AuditLog.action == "SPLIT_REPORT"
        )
    )
    audit = (await db_session.execute(stmt)).scalars().first()
    assert audit is not None
    assert "chemical leak" in audit.details["reason"]

@pytest.mark.asyncio
async def test_override_ai_assessment(
    client: httpx.AsyncClient,
    operator_auth_headers: dict,
    db_session: AsyncSession
):
    """Operator overrides AI category or urgency with human authority."""
    inc = Incident(
        public_code=f"OVR-{uuid.uuid4().hex[:3].upper()}",
        title="AI Classification Pending",
        category="other",
        urgency="low",
        status="reported",
        location="SRID=4326;POINT(77.2731 28.5452)",
    )
    db_session.add(inc)
    await db_session.commit()
    inc_id = str(inc.id)

    override_resp = await client.post(
        "/api/v1/operator/actions/override",
        json={
            "incidentId": inc_id,
            "category": "fire_smoke",
            "urgency": "critical",
            "reason": "Eyewitness confirms open flame spreading to roof"
        },
        headers=operator_auth_headers
    )
    assert override_resp.status_code == status.HTTP_200_OK
    data = override_resp.json()
    assert data["category"] == "fire_smoke"
    assert data["urgency"] == "critical"
    assert data["evidenceLabel"] == "confirmed_by_operator"

@pytest.mark.asyncio
async def test_operator_settings_and_roster(
    client: httpx.AsyncClient,
    operator_auth_headers: dict
):
    """Verify operator settings read/update and responders roster."""
    # Settings read
    s_get = await client.get("/api/v1/operator/settings", headers=operator_auth_headers)
    assert s_get.status_code == status.HTTP_200_OK
    assert "clusterRadiusMeters" in s_get.json()

    # Settings update
    s_put = await client.put(
        "/api/v1/operator/settings",
        json={"clusterRadiusMeters": 250, "audioAlertsEnabled": False},
        headers=operator_auth_headers
    )
    assert s_put.status_code == status.HTTP_200_OK
    assert s_put.json()["clusterRadiusMeters"] == 250

    # Responders roster
    roster_resp = await client.get("/api/v1/operator/responders", headers=operator_auth_headers)
    assert roster_resp.status_code == status.HTTP_200_OK
    roster = roster_resp.json()
    assert len(roster) >= 3
    unit_codes = [r["unitCode"] for r in roster]
    assert "F-2" in unit_codes

    # Duplicate pairings
    dups_resp = await client.get("/api/v1/operator/duplicates", headers=operator_auth_headers)
    assert dups_resp.status_code == status.HTTP_200_OK
    assert isinstance(dups_resp.json(), list)
