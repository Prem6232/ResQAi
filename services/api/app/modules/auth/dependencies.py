from typing import List, Optional
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_jwt_token
from app.core.token_store import is_token_blacklisted
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.models.entities import User

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_PREFIX}/auth/login",
    auto_error=False
)

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Authenticate request via JWT Bearer token.
    Validates token signature, expiration, type, and Redis revocation status.
    """
    if not token:
        raise UnauthorizedError(message="Missing authentication credentials")

    payload = decode_jwt_token(token)

    if payload.get("type") != "access":
        raise UnauthorizedError(message="Invalid token type: access token required")

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise UnauthorizedError(message="Token has been revoked. Please log in again.")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError(message="Token missing subject identifier")

    stmt = (
        select(User)
        .options(selectinload(User.responder_profile))
        .where(User.id == user_id, User.is_active == True)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedError(message="User not found or account is deactivated")

    return user

def require_roles(allowed_roles: List[str]):
    """
    Enforce server-side Role-Based Access Control (RBAC).
    Matches permissions defined in frontend permissions.config.ts.
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenError(
                message=f"Access denied. User role '{current_user.role}' lacks permission. Required roles: {allowed_roles}"
            )
        return current_user
    return role_checker

async def require_approved_responder(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Enforce responder vetting gate: Responders cannot receive, view, or accept
    assignments unless an Administrator has vetted and approved their account.
    Admins and Operators have administrative access to responder resources.
    """
    if current_user.role in ["admin", "operator"]:
        return current_user

    if current_user.role != "responder":
        raise ForbiddenError(message="Only responders may access this resource")

    profile = current_user.responder_profile
    if not profile or not profile.is_approved:
        raise ForbiddenError(message="Responder account is pending administrator approval")

    return current_user
