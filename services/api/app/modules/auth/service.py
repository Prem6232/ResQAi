import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
)
from app.core.redis import get_rate_limit_count, increment_rate_limit, reset_rate_limit
from app.core.token_store import (
    store_refresh_token,
    verify_and_revoke_refresh_token,
    blacklist_token,
)
from app.core.exceptions import (
    AppException,
    UnauthorizedError,
    RateLimitExceededError,
)
from app.models.entities import User, ResponderProfile, AuditLog
from app.modules.auth.schemas import (
    RegisterPayload,
    LoginPayload,
    UserProfileResponse,
    TokenResponse,
    ResponderProfileSummary,
    LogoutResponse,
)

logger = logging.getLogger("sentinelgrid.auth.service")

def build_user_profile(user: User) -> UserProfileResponse:
    """Build UserProfileResponse with dual snake_case and camelCase support."""
    responder_summary = None
    is_approved_val = None

    if user.responder_profile:
        is_approved_val = user.responder_profile.is_approved
        responder_summary = ResponderProfileSummary(
            id=str(user.responder_profile.id),
            unit_code=user.responder_profile.unit_code,
            display_name=user.responder_profile.display_name,
            responder_type=user.responder_profile.responder_type,
            capabilities=user.responder_profile.capabilities or [],
            is_on_duty=user.responder_profile.is_on_duty,
            availability_status=user.responder_profile.availability_status,
            is_approved=user.responder_profile.is_approved,
        )

    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        name=user.full_name,
        role=user.role,
        roles=[user.role],
        activeRole=user.role,
        phone=user.phone,
        is_active=user.is_active,
        campus_name="Northridge Campus (synthetic)",
        campusName="Northridge Campus (synthetic)",
        is_approved=is_approved_val,
        responder_profile=responder_summary,
    )

def build_token_response(
    user: User,
    access_token: str,
    refresh_token: str,
    expires_at: int
) -> TokenResponse:
    profile = build_user_profile(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_at=expires_at,
        accessToken=access_token,
        refreshToken=refresh_token,
        expiresAt=expires_at,
        user=profile,
    )

async def register_user(db: AsyncSession, payload: RegisterPayload) -> TokenResponse:
    """
    Register a new citizen or responder.
    - Citizens are immediately active.
    - Responders are created with is_approved=False pending admin vetting.
    - Operator & Admin self-registration is strictly disallowed.
    """
    if payload.role not in ["citizen", "responder"]:
        raise AppException(
            code="INVALID_ROLE",
            message="Only 'citizen' and 'responder' roles can self-register. Administrative roles are provisioned by an Admin.",
            status_code=400,
        )

    # Check if email is already registered
    existing_stmt = select(User).where(User.email == payload.email)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise AppException(
            code="EMAIL_ALREADY_EXISTS",
            message=f"An account with email '{payload.email}' already exists.",
            status_code=400,
        )

    full_name = payload.full_name or payload.name or payload.email.split("@")[0]
    hashed_pw = get_password_hash(payload.password)

    user = User(
        email=payload.email,
        hashed_password=hashed_pw,
        full_name=full_name,
        phone=payload.phone,
        role=payload.role,
        is_active=True,
    )

    if payload.role == "responder":
        unit_code = f"RES-{uuid.uuid4().hex[:4].upper()}"
        responder_profile = ResponderProfile(
            user=user,
            unit_code=unit_code,
            display_name=full_name,
            responder_type=payload.responder_type or "campus_security",
            capabilities=payload.capabilities or ["first_aid"],
            is_approved=False, # Must be approved by Admin
            is_on_duty=False,
            availability_status="off_duty",
        )
        user.responder_profile = responder_profile

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Re-query with eager load to ensure full object graph
    stmt = (
        select(User)
        .options(selectinload(User.responder_profile))
        .where(User.id == user.id)
    )
    loaded_user = (await db.execute(stmt)).scalar_one()

    # Generate tokens
    access_token, _, expires_at = create_access_token({
        "sub": str(loaded_user.id),
        "email": loaded_user.email,
        "role": loaded_user.role,
    })
    refresh_token_str, refresh_jti, _ = create_refresh_token(
        user_id=str(loaded_user.id),
        email=loaded_user.email,
        role=loaded_user.role,
    )
    await store_refresh_token(str(loaded_user.id), refresh_jti)

    return build_token_response(loaded_user, access_token, refresh_token_str, expires_at)

async def login_user(
    db: AsyncSession,
    payload: LoginPayload,
    client_ip: str
) -> TokenResponse:
    """
    Authenticate user credentials, enforce rate limits, and mint JWT token pair.
    Failed logins write to the immutable audit_logs table.
    """
    rate_limit_key = f"ratelimit:login:{client_ip}"
    current_count = await get_rate_limit_count(rate_limit_key)

    if current_count >= 5:
        # Log rate limit lockout event to audit trail
        audit = AuditLog(
            actor_email=payload.email,
            action="FAILED_LOGIN",
            target_entity="User",
            target_id=payload.email,
            details={"reason": "rate_limited", "attempt_count": current_count},
            ip_address=client_ip,
        )
        db.add(audit)
        await db.commit()
        raise RateLimitExceededError(
            message="Too many login attempts. Please wait 60 seconds before trying again."
        )

    # Query user with eager-loaded responder profile
    stmt = (
        select(User)
        .options(selectinload(User.responder_profile))
        .where(User.email == payload.email)
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        new_count = await increment_rate_limit(rate_limit_key, window_seconds=60)
        # Audit failed login attempt
        audit = AuditLog(
            user_id=user.id if user else None,
            actor_email=payload.email,
            action="FAILED_LOGIN",
            target_entity="User",
            target_id=str(user.id) if user else payload.email,
            details={"reason": "invalid_credentials", "attempt_count": new_count},
            ip_address=client_ip,
        )
        db.add(audit)
        await db.commit()
        raise UnauthorizedError(message="Invalid email or password")

    if not user.is_active:
        raise UnauthorizedError(message="User account has been deactivated. Contact an administrator.")

    # Mints tokens
    access_token, _, expires_at = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })
    refresh_token_str, refresh_jti, _ = create_refresh_token(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )
    await store_refresh_token(str(user.id), refresh_jti)

    # Clear rate limit counter on successful login
    await reset_rate_limit(rate_limit_key)

    return build_token_response(user, access_token, refresh_token_str, expires_at)

async def refresh_user_token(
    db: AsyncSession,
    refresh_token_str: str
) -> TokenResponse:
    """
    Validate refresh token in Redis, revoke prior token, and issue a fresh pair (Rotation).
    """
    payload = decode_jwt_token(refresh_token_str)

    if payload.get("type") != "refresh":
        raise UnauthorizedError(message="Invalid token type: refresh token required")

    user_id = payload.get("sub")
    jti = payload.get("jti")

    if not user_id or not jti:
        raise UnauthorizedError(message="Malformed refresh token")

    # Atomic verification & revocation in Redis
    is_valid = await verify_and_revoke_refresh_token(user_id, jti)
    if not is_valid:
        raise UnauthorizedError(message="Refresh token has expired, been revoked, or already used")

    stmt = (
        select(User)
        .options(selectinload(User.responder_profile))
        .where(User.id == user_id, User.is_active == True)
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise UnauthorizedError(message="User not found or account deactivated")

    # Issue new token pair
    access_token, _, expires_at = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    })
    new_refresh_token, new_refresh_jti, _ = create_refresh_token(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
    )
    await store_refresh_token(str(user.id), new_refresh_jti)

    return build_token_response(user, access_token, new_refresh_token, expires_at)

async def logout_user(token: str) -> LogoutResponse:
    """
    Revoke access token by blacklisting its JTI in Redis for its remaining TTL.
    """
    payload = decode_jwt_token(token)
    jti = payload.get("jti")
    exp = payload.get("exp")

    if jti and exp:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        remaining_ttl = max(1, exp - now_ts)
        await blacklist_token(jti, remaining_ttl)

    return LogoutResponse(ok=True, message="Successfully logged out")
