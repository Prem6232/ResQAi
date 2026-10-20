from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.entities import User
from app.modules.auth.schemas import (
    RegisterPayload,
    LoginPayload,
    RefreshTokenRequest,
    TokenResponse,
    UserProfileResponse,
    LogoutResponse,
)
from app.modules.auth.service import (
    register_user,
    login_user,
    refresh_user_token,
    logout_user,
    build_user_profile,
)
from app.modules.auth.dependencies import get_current_user, oauth2_scheme

router = APIRouter()

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account"
)
async def register(
    payload: RegisterPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new citizen (immediate active) or responder (requires admin approval).
    Returns JWT access and refresh tokens along with user profile.
    """
    return await register_user(db, payload)

@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User authentication & token minting"
)
async def login(
    payload: LoginPayload,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate user credentials, check rate limits (max 5/min), and issue tokens.
    Failed logins are permanently logged in the audit trail.
    """
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "127.0.0.1")
    )
    return await login_user(db, payload, client_ip)

@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate refresh token"
)
async def refresh(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Exchange an active refresh token for a newly rotated access and refresh token pair.
    The prior refresh token is revoked in Redis.
    """
    return await refresh_user_token(db, payload.token)

@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke current access token"
)
async def logout(
    token: str = Depends(oauth2_scheme)
):
    """
    Blacklist the caller's JWT access token in Redis until its expiration.
    Subsequent requests with this token will be rejected with HTTP 401.
    """
    return await logout_user(token)

@router.get(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get authenticated user profile"
)
async def get_me(
    current_user: User = Depends(get_current_user)
):
    """
    Return profile data for the authenticated caller.
    """
    return build_user_profile(current_user)
