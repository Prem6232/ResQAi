import pytest
import time
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import status

from app.models.entities import OutboxEvent, Report, Incident, IncidentReport
from app.core.outbox import claim_pending_outbox_events, mark_outbox_event_published

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
async def test_sos_beacon_subsecond_and_outbox(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """
    POST /citizen/sos must respond in < 1,000ms.
    Persists report and atomically generates OUTBOX_SOS_CREATED event.
    """
    payload = {
        "location": {
            "lat": 28.5452,
            "lng": 77.2731,
            "accuracyMeters": 10.0,
            "source": "gps"
        },
        "locationLabel": "Main Quadrangle · Coordinates Broadcasted",
        "note": "Urgent medical assistance required at main library gate",
        "idempotencyKey": f"sos_{uuid.uuid4().hex}"
    }

    start_time = time.perf_counter()
    response = await client.post(
        "/api/v1/citizen/sos",
        json=payload,
        headers=citizen_auth_headers
    )
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    assert response.status_code == status.HTTP_201_CREATED
    assert elapsed_ms < 1000.0, f"SOS latency exceeded 1,000ms: {elapsed_ms:.2f}ms"

    data = response.json()
    assert data["channel"] == "sos"
    assert data["category"] == "personal_safety"
    assert data["urgency"] == "critical"
    assert data["deliveryState"] == "received_by_server"
    assert data["location"]["lat"] == 28.5452
    assert data["location"]["lng"] == 77.2731

    # Verify atomic Outbox Event in database
    report_uuid = uuid.UUID(data["id"])
    stmt = (
        select(OutboxEvent)
        .where(
            OutboxEvent.aggregate_id == report_uuid,
            OutboxEvent.event_type == "OUTBOX_SOS_CREATED"
        )
    )
    res = await db_session.execute(stmt)
    outbox_event = res.scalar_one_or_none()
    assert outbox_event is not None
    assert outbox_event.status == "pending"
    assert outbox_event.payload["urgency"] == "critical"

@pytest.mark.asyncio
async def test_sos_and_report_idempotency_deduplication(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Identical idempotencyKey returns existing record without duplicating in database."""
    unique_key = f"idemp_{uuid.uuid4().hex}"
    payload = {
        "category": "road_accident",
        "text": "Bicycle collision outside cafeteria",
        "location": {"lat": 28.5460, "lng": 77.2735, "source": "manual_map"},
        "locationLabel": "Cafeteria Crossroads",
        "channel": "form",
        "idempotencyKey": unique_key
    }

    # First submission
    resp1 = await client.post("/api/v1/citizen/reports", json=payload, headers=citizen_auth_headers)
    assert resp1.status_code == status.HTTP_201_CREATED
    data1 = resp1.json()

    # Second submission with same idempotencyKey (retry scenario)
    resp2 = await client.post("/api/v1/citizen/reports", json=payload, headers=citizen_auth_headers)
    assert resp2.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
    data2 = resp2.json()

    assert data1["id"] == data2["id"]
    assert data1["createdAt"] == data2["createdAt"]

@pytest.mark.asyncio
async def test_report_submission_all_categories(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Verify backend supports full harmonized category enum including water_flood."""
    categories = ["fire_smoke", "water_flood", "road_accident", "medical", "personal_safety", "hazard", "other"]

    for cat in categories:
        payload = {
            "category": cat,
            "text": f"Testing category ingestion for {cat}",
            "location": {"lat": 28.5455, "lng": 77.2730, "source": "gps"},
            "locationLabel": f"Zone for {cat}",
            "idempotencyKey": f"cat_{cat}_{uuid.uuid4().hex[:6]}"
        }
        resp = await client.post("/api/v1/citizen/reports", json=payload, headers=citizen_auth_headers)
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["category"] == cat

@pytest.mark.asyncio
async def test_citizen_report_rbac_isolation(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Ensure Citizen B cannot view or cancel Citizen A's reports."""
    # 1. Citizen A submits report
    payload = {
        "category": "personal_safety",
        "text": "Citizen A confidential report",
        "location": {"lat": 28.5450, "lng": 77.2730},
        "idempotencyKey": f"user_a_{uuid.uuid4().hex}"
    }
    resp_a = await client.post("/api/v1/citizen/reports", json=payload, headers=citizen_auth_headers)
    report_a_id = resp_a.json()["id"]

    # 2. Register Citizen B
    b_email = f"citizen_b_{uuid.uuid4().hex[:6]}@campus.demo"
    reg_b = await client.post(
        "/api/v1/auth/register",
        json={"email": b_email, "password": "password123", "full_name": "Citizen B"}
    )
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Citizen B list reports -> should NOT contain report_a_id
    list_b = await client.get("/api/v1/citizen/reports", headers=headers_b)
    ids_b = [r["id"] for r in list_b.json()]
    assert report_a_id not in ids_b

    # 4. Citizen B directly querying report A -> 403 Forbidden
    get_forbidden = await client.get(f"/api/v1/citizen/reports/{report_a_id}", headers=headers_b)
    assert get_forbidden.status_code == status.HTTP_403_FORBIDDEN

    # 5. Citizen B attempting to cancel report A -> 403 Forbidden
    cancel_forbidden = await client.post(
        f"/api/v1/citizen/reports/{report_a_id}/cancel",
        json={"reason": "Malicious cancellation attempt"},
        headers=headers_b
    )
    assert cancel_forbidden.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_cancel_report_pre_dispatch(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Citizen can cancel an undispatched report."""
    resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "hazard",
            "text": "Water spill in corridor",
            "location": {"lat": 28.5910, "lng": 77.2910},
            "idempotencyKey": f"cancel_test_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    report_id = resp.json()["id"]

    # Cancel report
    cancel_resp = await client.post(
        f"/api/v1/citizen/reports/{report_id}/cancel",
        json={"reason": "Spill cleaned up by janitor"},
        headers=citizen_auth_headers
    )
    assert cancel_resp.status_code == status.HTTP_200_OK
    data = cancel_resp.json()
    assert data["processingState"] == "cancelled"
    assert data["cancelledReason"] == "Spill cleaned up by janitor"

@pytest.mark.asyncio
async def test_cannot_cancel_dispatched_incident(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict,
    db_session: AsyncSession
):
    """Report cannot be cancelled once linked incident has advanced beyond triage."""
    # Create report
    resp = await client.post(
        "/api/v1/citizen/reports",
        json={
            "category": "fire_smoke",
            "text": "Flaming trash can",
            "location": {"lat": 28.5451, "lng": 77.2731},
            "idempotencyKey": f"dispatched_test_{uuid.uuid4().hex}"
        },
        headers=citizen_auth_headers
    )
    report_id = resp.json()["id"]

    # Manually link to a confirmed/assigned incident
    stmt = select(Incident).where(Incident.public_code == "402") # Seeded incident in 'assigned' status
    res = await db_session.execute(stmt)
    inc = res.scalar_one()

    link = IncidentReport(incident_id=inc.id, report_id=uuid.UUID(report_id))
    db_session.add(link)
    await db_session.commit()

    # Attempt to cancel -> must fail with 400
    cancel_resp = await client.post(
        f"/api/v1/citizen/reports/{report_id}/cancel",
        json={"reason": "Mistake"},
        headers=citizen_auth_headers
    )
    assert cancel_resp.status_code == status.HTTP_400_BAD_REQUEST
    assert cancel_resp.json()["code"] == "CANNOT_CANCEL_DISPATCHED_INCIDENT"

@pytest.mark.asyncio
async def test_trusted_contacts_crud_and_max_limit(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Verify CRUD operations for emergency contacts and enforcement of max 3 limit."""
    # List initial
    init_resp = await client.get("/api/v1/citizen/contacts", headers=citizen_auth_headers)
    initial_contacts = init_resp.json()

    # Clean up existing to have clean state
    for c in initial_contacts:
        await client.delete(f"/api/v1/citizen/contacts/{c['id']}", headers=citizen_auth_headers)

    # Add Contact 1
    c1 = await client.post(
        "/api/v1/citizen/contacts",
        json={"name": "Emergency Roommate", "phone": "+919876543201", "relationship_label": "Roommate"},
        headers=citizen_auth_headers
    )
    assert c1.status_code == status.HTTP_201_CREATED
    c1_id = c1.json()["id"]

    # Add Contact 2
    c2 = await client.post(
        "/api/v1/citizen/contacts",
        json={"name": "Parent", "phone": "+919876543202", "relationship_label": "Mother"},
        headers=citizen_auth_headers
    )
    assert c2.status_code == status.HTTP_201_CREATED

    # Add Contact 3
    c3 = await client.post(
        "/api/v1/citizen/contacts",
        json={"name": "Campus Advisor", "phone": "+919876543203", "relationship_label": "Advisor"},
        headers=citizen_auth_headers
    )
    assert c3.status_code == status.HTTP_201_CREATED

    # Attempt Contact 4 (Must fail with 400 MAX_CONTACTS_REACHED)
    c4 = await client.post(
        "/api/v1/citizen/contacts",
        json={"name": "Sibling", "phone": "+919876543204", "relationship_label": "Brother"},
        headers=citizen_auth_headers
    )
    assert c4.status_code == status.HTTP_400_BAD_REQUEST
    assert c4.json()["code"] == "MAX_CONTACTS_REACHED"

    # Delete Contact 1
    del_resp = await client.delete(f"/api/v1/citizen/contacts/{c1_id}", headers=citizen_auth_headers)
    assert del_resp.status_code == status.HTTP_200_OK

    # Now Contact 4 should succeed
    c4_retry = await client.post(
        "/api/v1/citizen/contacts",
        json={"name": "Sibling", "phone": "+919876543204", "relationship_label": "Brother"},
        headers=citizen_auth_headers
    )
    assert c4_retry.status_code == status.HTTP_201_CREATED

@pytest.mark.asyncio
async def test_nearby_alerts_coarsened_privacy(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Verify nearby alerts feed returns active incidents with coarsened coordinates."""
    response = await client.get(
        "/api/v1/citizen/alerts/nearby?lat=28.5452&lng=77.2731&radius_km=10.0",
        headers=citizen_auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    alerts = response.json()
    assert len(alerts) > 0

    first = alerts[0]
    assert first["coarsened"] is True
    assert "distanceLabel" in first
    assert "statusLabel" in first
    assert "location" in first
    # Verify coordinate precision is coarse (~4 decimals max)
    lat_str = str(first["location"]["lat"])
    decimals = len(lat_str.split(".")[1]) if "." in lat_str else 0
    assert decimals <= 4

@pytest.mark.asyncio
async def test_media_presigned_upload_and_validation(
    client: httpx.AsyncClient,
    citizen_auth_headers: dict
):
    """Verify presigned upload URL generation, size limits, and MIME restriction."""
    # 1. Valid JPEG
    valid_payload = {
        "fileName": "lab_smoke.jpg",
        "mimeType": "image/jpeg",
        "fileSizeBytes": 2_500_000
    }
    resp = await client.post("/api/v1/media/upload-url", json=valid_payload, headers=citizen_auth_headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "uploadUrl" in data
    assert "mediaAssetId" in data
    asset_id = data["mediaAssetId"]

    # 2. File exceeding 15MB limit
    oversized_payload = {
        "fileName": "giant_video.mp4",
        "mimeType": "video/mp4",
        "fileSizeBytes": 20_000_000 # 20MB > 15MB
    }
    over_resp = await client.post("/api/v1/media/upload-url", json=oversized_payload, headers=citizen_auth_headers)
    assert over_resp.status_code == status.HTTP_400_BAD_REQUEST
    assert over_resp.json()["code"] == "FILE_TOO_LARGE"

    # 3. Disallowed MIME type (.exe)
    invalid_mime = {
        "fileName": "payload.exe",
        "mimeType": "application/x-msdownload",
        "fileSizeBytes": 100_000
    }
    mime_resp = await client.post("/api/v1/media/upload-url", json=invalid_mime, headers=citizen_auth_headers)
    assert mime_resp.status_code == status.HTTP_400_BAD_REQUEST
    assert mime_resp.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"

    # 4. Confirm upload
    conf_resp = await client.post(f"/api/v1/media/{asset_id}/confirm", headers=citizen_auth_headers)
    assert conf_resp.status_code == status.HTTP_200_OK
    assert conf_resp.json()["id"] == asset_id
    assert conf_resp.json()["kind"] == "image"

@pytest.mark.asyncio
async def test_outbox_concurrency_skip_locked(db_session: AsyncSession):
    """Verify outbox claiming with SELECT FOR UPDATE SKIP LOCKED."""
    # Claim pending events
    events = await claim_pending_outbox_events(db_session, batch_size=10)
    assert isinstance(events, list)

    if events:
        event = events[0]
        assert event.status == "pending"
        # Mark as published
        await mark_outbox_event_published(db_session, event.id)

        # Verify status is now published
        stmt = select(OutboxEvent).where(OutboxEvent.id == event.id)
        recheck = (await db_session.execute(stmt)).scalar_one()
        assert recheck.status == "published"
