from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.models.entities import User
from app.modules.media.schemas import (
    PresignedUrlRequest,
    PresignedUrlResponse,
    MediaConfirmRequest,
    MediaAssetResponse,
)
from app.modules.media.service import (
    create_presigned_upload,
    confirm_media_asset,
    get_media_asset_response,
)

router = APIRouter()

@router.post(
    "/upload-url",
    response_model=PresignedUrlResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate MinIO presigned upload URL"
)
async def request_upload_url(
    payload: PresignedUrlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate short-lived presigned PUT URL for uploading evidence photos/audio/video.
    Enforces MIME type allowlist and 15MB maximum file size.
    """
    return await create_presigned_upload(db, payload)

@router.post(
    "/{id}/confirm",
    response_model=MediaAssetResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm media upload completion"
)
async def confirm_upload(
    id: str,
    payload: Optional[MediaConfirmRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate and confirm media upload. Optionally associates asset with a Report ID.
    """
    report_id = payload.report_id if payload else None
    return await confirm_media_asset(db, id, report_id)

@router.get(
    "/{id}/url",
    response_model=MediaAssetResponse,
    status_code=status.HTTP_200_OK,
    summary="Get temporary presigned GET URL for media asset"
)
async def get_media_url_endpoint(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return temporary presigned URL for downloading or viewing an evidence asset.
    """
    return await get_media_asset_response(db, id)
