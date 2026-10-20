import pytest
from sqlalchemy import select
from app.models.user import User
from app.models.responder import ResponderProfile
from app.models.incident import Incident
from app.models.operating_area import OperatingArea
from app.common.spatial import haversine_distance_meters, coarsen_coordinates, point_to_wkt

@pytest.mark.asyncio
async def test_health_check_endpoint(client):
    """Exit check: /api/v1/health returns healthy with PostGIS and Redis connected."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["api"] == "online"
    assert data["database"] == "connected"
    assert "3.4" in data["postgis_version"]
    assert data["redis"] == "connected"

@pytest.mark.asyncio
async def test_request_id_middleware(client):
    """Test X-Request-Id header propagation and timing."""
    custom_req_id = "test-custom-request-id-12345"
    response = await client.get("/", headers={"X-Request-Id": custom_req_id})
    assert response.status_code == 200
    assert response.headers.get("X-Request-Id") == custom_req_id
    assert "X-Process-Time" in response.headers

    # Auto-generate if absent
    res_auto = await client.get("/")
    assert res_auto.headers.get("X-Request-Id") is not None

@pytest.mark.asyncio
async def test_seed_data_loaded(db_session):
    """Exit check: Seed data loads users, responders, geofence, and incidents."""
    # Check demo citizen
    citizen = await db_session.execute(select(User).where(User.email == "citizen@campus.demo"))
    assert citizen.scalar_one_or_none() is not None

    # Check demo operator
    operator = await db_session.execute(select(User).where(User.email == "operator@campus.demo"))
    assert operator.scalar_one_or_none() is not None

    # Check demo responder with unit code F-2
    resp = await db_session.execute(select(ResponderProfile).where(ResponderProfile.unit_code == "F-2"))
    resp_profile = resp.scalar_one_or_none()
    assert resp_profile is not None
    assert resp_profile.is_approved is True
    assert "firefighting" in resp_profile.capabilities

    # Check unapproved responder V-01 exists for vetting gate tests
    resp_unapp = await db_session.execute(select(ResponderProfile).where(ResponderProfile.unit_code == "V-01"))
    unapproved = resp_unapp.scalar_one_or_none()
    assert unapproved is not None
    assert unapproved.is_approved is False

    # Check campus geofence polygon
    area = await db_session.execute(select(OperatingArea).where(OperatingArea.name.ilike("%Northridge%")))
    assert area.scalar_one_or_none() is not None

    # Check initial incident 402
    inc = await db_session.execute(select(Incident).where(Incident.public_code == "402"))
    incident_402 = inc.scalar_one_or_none()
    assert incident_402 is not None
    assert incident_402.category == "fire_smoke"
    assert incident_402.urgency == "critical"

@pytest.mark.asyncio
async def test_spatial_utilities():
    """Test spatial helpers for distance calculation and coarsening."""
    # Delhi campus coordinates
    lat1, lng1 = 28.5452, 77.2731
    lat2, lng2 = 28.5464, 77.2741

    dist = haversine_distance_meters(lat1, lng1, lat2, lng2)
    assert 100 < dist < 200 # roughly 165 meters

    # Test coordinate coarsening (rounds to ~100m grid for citizen alerts)
    coarse = coarsen_coordinates(28.5452345, 77.2731456)
    assert coarse.lat == 28.545
    assert coarse.lng == 77.273
    assert coarse.source == "simulated"
