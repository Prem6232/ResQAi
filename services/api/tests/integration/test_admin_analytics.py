import pytest
import uuid
import httpx
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.entities import User, ResponderProfile, OperatingArea, AuditLog

async def get_token_for(client: httpx.AsyncClient, email: str) -> str:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "demo1234"}
    )
    assert login_resp.status_code == status.HTTP_200_OK
    return login_resp.json()["access_token"]

@pytest.mark.asyncio
async def test_admin_rbac_isolation(client: httpx.AsyncClient):
    """
    Enforce strict Admin RBAC isolation:
    - Citizens and Responders get 403 Forbidden on admin management endpoints.
    - Unauthenticated callers get 401 Unauthorized.
    - Operators can view operating-area and audit-logs, but cannot approve responders or update polygon.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    op_token = await get_token_for(client, "operator@campus.demo")
    resp_token = await get_token_for(client, "responder@campus.demo")
    cit_token = await get_token_for(client, "citizen@campus.demo")

    # 1. Unauthenticated -> 401
    unauth = await client.get("/api/v1/admin/responders")
    assert unauth.status_code == status.HTTP_401_UNAUTHORIZED

    # 2. Citizen -> 403 on all admin endpoints
    cit_headers = {"Authorization": f"Bearer {cit_token}"}
    r1 = await client.get("/api/v1/admin/responders", headers=cit_headers)
    assert r1.status_code == status.HTTP_403_FORBIDDEN
    r2 = await client.get("/api/v1/admin/operating-area", headers=cit_headers)
    assert r2.status_code == status.HTTP_403_FORBIDDEN
    r3 = await client.get("/api/v1/admin/audit-logs", headers=cit_headers)
    assert r3.status_code == status.HTTP_403_FORBIDDEN

    # 3. Responder -> 403 on all admin endpoints
    resp_headers = {"Authorization": f"Bearer {resp_token}"}
    r4 = await client.get("/api/v1/admin/responders", headers=resp_headers)
    assert r4.status_code == status.HTTP_403_FORBIDDEN

    # 4. Operator -> 200 on operating-area and audit-logs, 403 on responder approval and polygon update
    op_headers = {"Authorization": f"Bearer {op_token}"}
    r5 = await client.get("/api/v1/admin/operating-area", headers=op_headers)
    assert r5.status_code == status.HTTP_200_OK
    r6 = await client.get("/api/v1/admin/audit-logs", headers=op_headers)
    assert r6.status_code == status.HTTP_200_OK
    r7 = await client.get("/api/v1/admin/responders", headers=op_headers)
    assert r7.status_code == status.HTTP_403_FORBIDDEN
    r8 = await client.put(
        "/api/v1/admin/operating-area",
        json={"name": "Tampered"},
        headers=op_headers
    )
    assert r8.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.asyncio
async def test_admin_responders_list_and_vetting_flow(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    Admin lists all responders and exercises approval/revocation flow with audit logging.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. List responders
    resp = await client.get("/api/v1/admin/responders", headers=admin_headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert len(data) >= 3 # Seed includes F-2, A-12, P-07

    target_profile = next((r for r in data if r["unitCode"] == "F-2"), data[0])
    profile_id = target_profile["id"]

    # 2. Revoke approval
    revoke_resp = await client.post(
        f"/api/v1/admin/responders/{profile_id}/approve",
        json={"approved": False},
        headers=admin_headers
    )
    assert revoke_resp.status_code == status.HTTP_200_OK
    assert revoke_resp.json()["isApproved"] is False

    # 3. Re-approve responder
    approve_resp = await client.post(
        f"/api/v1/admin/responders/{profile_id}/approve",
        json={"approved": True},
        headers=admin_headers
    )
    assert approve_resp.status_code == status.HTTP_200_OK
    assert approve_resp.json()["isApproved"] is True

    # 4. Verify audit log entry was created
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.target_id == profile_id,
            AuditLog.action.in_(["APPROVE_RESPONDER", "REVOKE_RESPONDER"])
        )
        .order_by(AuditLog.created_at.desc())
    )
    audit = (await db_session.execute(stmt)).scalars().first()
    assert audit is not None
    assert audit.action == "APPROVE_RESPONDER"
    assert audit.actor_email == "admin@campus.demo"

@pytest.mark.asyncio
async def test_admin_operating_area_get_and_update(
    client: httpx.AsyncClient,
    db_session: AsyncSession
):
    """
    Admin fetches active geofence and updates campus perimeter with valid polygon.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Fetch current geofence
    get_resp = await client.get("/api/v1/admin/operating-area", headers=admin_headers)
    assert get_resp.status_code == status.HTTP_200_OK
    area = get_resp.json()
    assert "polygon" in area
    assert area["srid"] == 4326

    # 2. Update with valid expanded campus perimeter
    new_polygon = [
        [77.2680, 28.5400],
        [77.2780, 28.5400],
        [77.2780, 28.5500],
        [77.2680, 28.5500],
        [77.2680, 28.5400] # Closed ring
    ]
    update_resp = await client.put(
        "/api/v1/admin/operating-area",
        json={
            "name": "Northridge Campus Expanded Zone",
            "polygon": new_polygon
        },
        headers=admin_headers
    )
    assert update_resp.status_code == status.HTTP_200_OK
    updated_area = update_resp.json()
    assert updated_area["name"] == "Northridge Campus Expanded Zone"
    assert len(updated_area["polygon"]) == 5

    # 3. Verify audit record
    stmt = (
        select(AuditLog)
        .where(AuditLog.action == "UPDATE_CAMPUS_POLYGON")
        .order_by(AuditLog.created_at.desc())
    )
    audit = (await db_session.execute(stmt)).scalars().first()
    assert audit is not None
    assert audit.actor_email == "admin@campus.demo"

@pytest.mark.asyncio
async def test_admin_invalid_geofence_rejected(client: httpx.AsyncClient):
    """
    T24: Admin submits self-intersecting or invalid geofence polygon.
    GeoAlchemy2 / Shapely validation fails; HTTP 400 Bad Request returned.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Self-intersecting "bowtie" polygon
    bowtie_polygon = [
        [77.2690, 28.5410],
        [77.2770, 28.5490],
        [77.2770, 28.5410],
        [77.2690, 28.5490],
        [77.2690, 28.5410]
    ]

    resp = await client.put(
        "/api/v1/admin/operating-area",
        json={
            "name": "Invalid Bowtie Zone",
            "polygon": bowtie_polygon
        },
        headers=admin_headers
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    err_body = resp.json()
    err_msg = (err_body.get("message") or err_body.get("detail") or "").lower()
    assert "invalid" in err_msg or "self-intersection" in err_msg

@pytest.mark.asyncio
async def test_admin_audit_logs_search_and_immutability(client: httpx.AsyncClient):
    """
    T19: Search audit trail with filters; direct attempt to UPDATE or DELETE an
    audit_logs record returns HTTP 405 Method Not Allowed (append-only ledger).
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Search audit logs
    query_resp = await client.get(
        "/api/v1/admin/audit-logs?limit=10",
        headers=admin_headers
    )
    assert query_resp.status_code == status.HTTP_200_OK
    data = query_resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) > 0

    first_item = data["items"][0]
    assert "action" in first_item
    assert "actor" in first_item
    assert "target" in first_item

    # Filter by action
    filter_resp = await client.get(
        f"/api/v1/admin/audit-logs?action={first_item['action']}",
        headers=admin_headers
    )
    assert filter_resp.status_code == status.HTTP_200_OK
    for item in filter_resp.json()["items"]:
        assert item["action"] == first_item["action"]

    # 2. T19: Immutability check - direct attempt to DELETE or PATCH audit logs must return 405
    del_resp = await client.delete(
        f"/api/v1/admin/audit-logs/{first_item['id']}",
        headers=admin_headers
    )
    assert del_resp.status_code in [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_404_NOT_FOUND]

    patch_resp = await client.patch(
        f"/api/v1/admin/audit-logs/{first_item['id']}",
        json={"action": "TAMPERED"},
        headers=admin_headers
    )
    assert patch_resp.status_code in [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_404_NOT_FOUND]

@pytest.mark.asyncio
async def test_admin_toggle_drill_mode(client: httpx.AsyncClient):
    """
    Admin toggles simulated drill mode state across platform.
    """
    admin_token = await get_token_for(client, "admin@campus.demo")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Turn off drill mode
    resp1 = await client.post(
        "/api/v1/admin/drill-mode",
        json={"drillMode": False},
        headers=admin_headers
    )
    assert resp1.status_code == status.HTTP_200_OK
    assert resp1.json()["drillMode"] is False

    # Turn on drill mode
    resp2 = await client.post(
        "/api/v1/admin/drill-mode",
        json={"enabled": True},
        headers=admin_headers
    )
    assert resp2.status_code == status.HTTP_200_OK
    assert resp2.json()["drillMode"] is True

@pytest.mark.asyncio
async def test_analytics_summary_kpis(client: httpx.AsyncClient):
    """
    T25: Calculate analytics summary on database; verify KPI metrics match expected schema and calculations.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    headers = {"Authorization": f"Bearer {op_token}"}

    resp = await client.get("/api/v1/analytics/summary", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    kpis = resp.json()

    assert "totalIncidents" in kpis
    assert "activeIncidents" in kpis
    assert "resolvedIncidents" in kpis
    assert "openReportsCount" in kpis
    assert "activeRespondersCount" in kpis
    assert "avgArrivalTimeMinutes" in kpis
    assert "avgResponseTimeSeconds" in kpis
    assert "falseAlarmRate" in kpis
    assert "syntheticDrillMode" in kpis

    assert kpis["totalIncidents"] >= 0
    assert kpis["activeRespondersCount"] >= 1
    assert kpis["avgArrivalTimeMinutes"] > 0.0

@pytest.mark.asyncio
async def test_analytics_hotspots_geojson(client: httpx.AsyncClient):
    """
    Verify /analytics/hotspots returns a valid GeoJSON FeatureCollection with incident weights.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    headers = {"Authorization": f"Bearer {op_token}"}

    resp = await client.get("/api/v1/analytics/hotspots", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    fc = resp.json()

    assert fc["type"] == "FeatureCollection"
    assert "features" in fc
    if fc["features"]:
        feat = fc["features"][0]
        assert feat["type"] == "Feature"
        assert feat["geometry"]["type"] == "Point"
        assert len(feat["geometry"]["coordinates"]) == 2 # [lng, lat]
        assert "weight" in feat["properties"]
        assert "category" in feat["properties"]

@pytest.mark.asyncio
async def test_analytics_by_category(client: httpx.AsyncClient):
    """
    Verify /analytics/by-category returns breakdown and percentage per category.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    headers = {"Authorization": f"Bearer {op_token}"}

    resp = await client.get("/api/v1/analytics/by-category", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()

    assert "categories" in data
    assert "total" in data
    assert isinstance(data["categories"], list)
    if data["total"] > 0:
        pct_sum = sum(c["percentage"] for c in data["categories"])
        assert 98.0 <= pct_sum <= 102.0 # Rounding tolerance

@pytest.mark.asyncio
async def test_analytics_response_times(client: httpx.AsyncClient):
    """
    Verify /analytics/response-times returns milestones and daily timeline.
    """
    op_token = await get_token_for(client, "operator@campus.demo")
    headers = {"Authorization": f"Bearer {op_token}"}

    resp = await client.get("/api/v1/analytics/response-times", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()

    assert "milestones" in data
    assert "timeline" in data
    assert len(data["milestones"]) >= 3 # dispatch, en_route, on_scene
    assert len(data["timeline"]) >= 5
