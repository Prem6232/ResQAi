import pytest
import uuid
from datetime import timedelta
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import APIRouter, Depends, status

from app.main import app
from app.core.security import create_access_token
from app.core.redis import reset_rate_limit
from app.models.entities import AuditLog
from app.modules.auth.dependencies import require_roles, require_approved_responder

# Setup mock test routes for RBAC verification
rbac_test_router = APIRouter(prefix="/test-rbac", tags=["Test RBAC"])

@rbac_test_router.get("/operator-only")
async def endpoint_operator_only(user=Depends(require_roles(["operator", "admin"]))):
    return {"message": "operator allowed", "email": user.email}

@rbac_test_router.get("/approved-responder-only")
async def endpoint_approved_responder_only(user=Depends(require_approved_responder)):
    return {"message": "responder allowed", "unit_code": user.responder_profile.unit_code}

app.include_router(rbac_test_router)

@pytest.mark.asyncio
async def test_login_all_four_roles(client: httpx.AsyncClient):
    """Verify demo users for all 4 roles sign in successfully and return valid profiles."""
    roles = [
        ("citizen@campus.demo", "citizen"),
        ("responder@campus.demo", "responder"),
        ("operator@campus.demo", "operator"),
        ("admin@campus.demo", "admin"),
    ]

    for email, expected_role in roles:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "demo1234"}
        )
        assert response.status_code == status.HTTP_200_OK, f"Failed login for {email}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == email
        assert data["user"]["role"] == expected_role
        assert expected_role in data["user"]["roles"]

        # Responders in seed should be pre-approved
        if expected_role == "responder":
            assert data["user"]["is_approved"] is True
            assert data["user"]["responder_profile"]["unit_code"] == "F-2"

@pytest.mark.asyncio
async def test_login_invalid_password_and_audit(client: httpx.AsyncClient, db_session: AsyncSession):
    """Verify failed login returns 401 and logs to immutable audit_logs."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "wrongpassword123"},
        headers={"X-Forwarded-For": "10.0.0.99"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data["code"] == "UNAUTHORIZED"

    # Verify audit log recorded
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.actor_email == "citizen@campus.demo",
            AuditLog.action == "FAILED_LOGIN"
        )
        .order_by(AuditLog.created_at.desc())
    )
    res = await db_session.execute(stmt)
    audit = res.scalars().first()
    assert audit is not None
    assert audit.target_entity == "User"

@pytest.mark.asyncio
async def test_login_rate_limiting(client: httpx.AsyncClient):
    """Verify exceeding 5 login attempts within window triggers HTTP 429 lockout."""
    test_ip = "192.168.100.99"
    await reset_rate_limit(f"ratelimit:login:{test_ip}")

    # Send 5 failed attempts
    for _ in range(5):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "unknown@campus.demo", "password": "wrong"},
            headers={"X-Forwarded-For": test_ip}
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    # 6th attempt should be locked out
    resp_lockout = await client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@campus.demo", "password": "wrong"},
        headers={"X-Forwarded-For": test_ip}
    )
    assert resp_lockout.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    data = resp_lockout.json()
    assert data["code"] == "RATE_LIMIT_EXCEEDED"

    # Clean up
    await reset_rate_limit(f"ratelimit:login:{test_ip}")

@pytest.mark.asyncio
async def test_register_citizen_immediate_active(client: httpx.AsyncClient):
    """Verify citizen self-registration is immediately active."""
    unique_email = f"citizen_{uuid.uuid4().hex[:6]}@campus.demo"
    payload = {
        "email": unique_email,
        "password": "strongPassword123",
        "full_name": "Test Citizen",
        "phone": "+919876543210",
        "role": "citizen"
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["user"]["email"] == unique_email
    assert data["user"]["role"] == "citizen"
    assert data["user"]["is_active"] is True
    assert "access_token" in data

    # Verify token allows access to /auth/me
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert me_resp.status_code == status.HTTP_200_OK
    assert me_resp.json()["email"] == unique_email

@pytest.mark.asyncio
async def test_register_responder_unapproved(client: httpx.AsyncClient):
    """Verify responder self-registration creates profile with is_approved=False."""
    unique_email = f"responder_{uuid.uuid4().hex[:6]}@campus.demo"
    payload = {
        "email": unique_email,
        "password": "strongPassword123",
        "full_name": "New Volunteer",
        "role": "responder",
        "responder_type": "volunteer",
        "capabilities": ["first_aid", "search_rescue"]
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["user"]["email"] == unique_email
    assert data["user"]["role"] == "responder"
    assert data["user"]["is_approved"] is False
    profile = data["user"]["responder_profile"]
    assert profile is not None
    assert profile["is_approved"] is False
    assert profile["responder_type"] == "volunteer"
    assert "search_rescue" in profile["capabilities"]

@pytest.mark.asyncio
async def test_register_duplicate_email_fails(client: httpx.AsyncClient):
    """Verify registration fails with 400 when email is already taken."""
    payload = {
        "email": "citizen@campus.demo", # Already seeded
        "password": "strongPassword123",
        "full_name": "Duplicate User",
        "role": "citizen"
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert data["code"] == "EMAIL_ALREADY_EXISTS"

@pytest.mark.asyncio
async def test_register_disallowed_role_fails(client: httpx.AsyncClient):
    """Verify self-registration as operator or admin is rejected with 400."""
    payload = {
        "email": f"hacker_{uuid.uuid4().hex[:6]}@campus.demo",
        "password": "strongPassword123",
        "full_name": "Rogue Operator",
        "role": "operator"
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert data["code"] == "INVALID_ROLE"

@pytest.mark.asyncio
async def test_token_refresh_rotation(client: httpx.AsyncClient):
    """Verify refresh token rotation issues new pair and invalidates old refresh token."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    tokens = login_resp.json()
    old_refresh_token = tokens["refresh_token"]

    # Rotate refresh token
    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh_token}
    )
    assert refresh_resp.status_code == status.HTTP_200_OK
    new_tokens = refresh_resp.json()
    assert "access_token" in new_tokens
    assert new_tokens["refresh_token"] != old_refresh_token

    # Verify new access token works
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"}
    )
    assert me_resp.status_code == status.HTTP_200_OK

    # Re-using old refresh token must fail with 401
    reuse_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh_token}
    )
    assert reuse_resp.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_logout_blacklists_token(client: httpx.AsyncClient):
    """Verify logout blacklists access token in Redis; subsequent calls return 401."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    token = login_resp.json()["access_token"]

    # Verify token works before logout
    check_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert check_resp.status_code == status.HTTP_200_OK

    # Logout
    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert logout_resp.status_code == status.HTTP_200_OK
    assert logout_resp.json()["ok"] is True

    # Token must now be rejected
    rejected_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert rejected_resp.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_tampered_and_expired_tokens(client: httpx.AsyncClient):
    """Verify tampered and expired tokens return 401 Unauthorized."""
    # Fake token
    fake_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.valid.jwt.token"}
    )
    assert fake_resp.status_code == status.HTTP_401_UNAUTHORIZED

    # Expired token (delta negative)
    expired_token, _, _ = create_access_token(
        {"sub": str(uuid.uuid4()), "email": "test@demo.com", "role": "citizen"},
        expires_delta=timedelta(seconds=-10)
    )
    expired_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert expired_resp.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_rbac_and_responder_vetting_guard(client: httpx.AsyncClient):
    """Verify role mismatch gives 403, and unapproved responder gives 403 on vetted routes."""
    # 1. Citizen login
    citizen_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@campus.demo", "password": "demo1234"}
    )
    citizen_token = citizen_login.json()["access_token"]

    # Citizen trying to access operator-only route -> 403 Forbidden
    op_forbidden = await client.get(
        "/test-rbac/operator-only",
        headers={"Authorization": f"Bearer {citizen_token}"}
    )
    assert op_forbidden.status_code == status.HTTP_403_FORBIDDEN
    assert op_forbidden.json()["code"] == "FORBIDDEN"

    # 2. Operator login
    op_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "operator@campus.demo", "password": "demo1234"}
    )
    op_token = op_login.json()["access_token"]

    # Operator accessing operator-only route -> 200 OK
    op_allowed = await client.get(
        "/test-rbac/operator-only",
        headers={"Authorization": f"Bearer {op_token}"}
    )
    assert op_allowed.status_code == status.HTTP_200_OK

    # 3. Approved responder (from seed) accessing approved-responder route -> 200 OK
    resp_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "responder@campus.demo", "password": "demo1234"}
    )
    approved_token = resp_login.json()["access_token"]
    resp_allowed = await client.get(
        "/test-rbac/approved-responder-only",
        headers={"Authorization": f"Bearer {approved_token}"}
    )
    assert resp_allowed.status_code == status.HTTP_200_OK

    # 4. Unapproved responder registering now -> trying to access vetted route -> 403 Forbidden
    unapproved_email = f"vet_{uuid.uuid4().hex[:6]}@campus.demo"
    unapproved_reg = await client.post(
        "/api/v1/auth/register",
        json={"email": unapproved_email, "password": "strongPassword123", "role": "responder"}
    )
    unapproved_token = unapproved_reg.json()["access_token"]
    unapproved_blocked = await client.get(
        "/test-rbac/approved-responder-only",
        headers={"Authorization": f"Bearer {unapproved_token}"}
    )
    assert unapproved_blocked.status_code == status.HTTP_403_FORBIDDEN
    assert "pending administrator approval" in unapproved_blocked.json()["message"]
