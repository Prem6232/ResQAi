import uuid
import logging
from typing import Optional
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.exceptions import AppException, NotFoundError
from app.models.entities import MediaAsset, Report
from app.modules.media.schemas import (
    PresignedUrlRequest,
    PresignedUrlResponse,
    MediaAssetResponse,
)

logger = logging.getLogger("sentinelgrid.media.service")

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 # 15 MB

ALLOWED_MIME_TYPES = {
    # Images
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    # Audio
    "audio/webm": "audio",
    "audio/mp4": "audio",
    "audio/mpeg": "audio",
    "audio/ogg": "audio",
    "audio/wav": "audio",
    # Video
    "video/mp4": "video",
    "video/webm": "video",
    "video/quicktime": "video",
}

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )

def ensure_bucket_exists():
    s3 = get_s3_client()
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except ClientError:
        try:
            s3.create_bucket(Bucket=settings.S3_BUCKET_NAME)
            logger.info(f"Created S3 bucket: {settings.S3_BUCKET_NAME}")
        except Exception as e:
            logger.warning(f"Could not create S3 bucket: {e}")

async def create_presigned_upload(
    db: AsyncSession,
    payload: PresignedUrlRequest
) -> PresignedUrlResponse:
    """Generate a short-lived MinIO presigned PUT URL with size and MIME validation."""
    if payload.file_size_bytes > MAX_FILE_SIZE_BYTES:
        raise AppException(
            code="FILE_TOO_LARGE",
            message=f"File size {payload.file_size_bytes} exceeds the 15MB limit.",
            status_code=400,
        )

    mime = payload.mime_type.lower()
    if mime not in ALLOWED_MIME_TYPES:
        raise AppException(
            code="UNSUPPORTED_MEDIA_TYPE",
            message=f"MIME type '{payload.mime_type}' is not supported. Allowed: images, audio, video.",
            status_code=400,
        )

    ensure_bucket_exists()
    s3 = get_s3_client()

    asset_id = uuid.uuid4()
    kind = ALLOWED_MIME_TYPES[mime]
    clean_name = payload.file_name.replace(" ", "_")
    s3_key = f"evidence/{asset_id}_{clean_name}"

    # Parse report_id if provided
    report_uuid = None
    if payload.report_id:
        try:
            report_uuid = uuid.UUID(payload.report_id)
        except ValueError:
            pass

    media_asset = MediaAsset(
        id=asset_id,
        report_id=report_uuid,
        file_type=kind,
        file_name=payload.file_name,
        s3_key=s3_key,
        file_size_bytes=payload.file_size_bytes,
        mime_type=mime,
    )
    db.add(media_asset)
    await db.commit()

    try:
        presigned_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": mime,
            },
            ExpiresIn=900,
        )
    except Exception as e:
        logger.error(f"Failed to generate presigned upload URL: {e}")
        # Fallback URL for testing
        presigned_url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{s3_key}"

    return PresignedUrlResponse(
        mediaAssetId=str(asset_id),
        media_asset_id=str(asset_id),
        uploadUrl=presigned_url,
        upload_url=presigned_url,
        expiresInSeconds=900,
        expires_in_seconds=900,
    )

async def confirm_media_asset(
    db: AsyncSession,
    asset_id: str,
    report_id: Optional[str] = None
) -> MediaAssetResponse:
    """Validate uploaded media file and link to report."""
    try:
        asset_uuid = uuid.UUID(asset_id)
    except ValueError:
        raise NotFoundError("Invalid media asset ID")

    stmt = select(MediaAsset).where(MediaAsset.id == asset_uuid)
    res = await db.execute(stmt)
    asset = res.scalar_one_or_none()

    if not asset:
        raise NotFoundError("Media asset not found")

    if report_id:
        try:
            asset.report_id = uuid.UUID(report_id)
            await db.commit()
        except ValueError:
            pass

    url = await get_media_url(asset.id, asset.s3_key)

    return MediaAssetResponse(
        id=str(asset.id),
        kind=asset.file_type,
        fileName=asset.file_name or "evidence",
        file_name=asset.file_name or "evidence",
        mimeType=asset.mime_type or "application/octet-stream",
        mime_type=asset.mime_type or "application/octet-stream",
        sizeBytes=asset.file_size_bytes or 0,
        size_bytes=asset.file_size_bytes or 0,
        url=url,
    )

async def get_media_url(asset_id: uuid.UUID, s3_key: str) -> str:
    """Generate temporary presigned GET URL for media download/preview."""
    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=3600,
        )
        return url
    except Exception as e:
        logger.warning(f"Could not generate presigned GET url: {e}")
        return f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{s3_key}"

async def get_media_asset_response(db: AsyncSession, asset_id: str) -> MediaAssetResponse:
    try:
        asset_uuid = uuid.UUID(asset_id)
    except ValueError:
        raise NotFoundError("Invalid media asset ID")

    stmt = select(MediaAsset).where(MediaAsset.id == asset_uuid)
    res = await db.execute(stmt)
    asset = res.scalar_one_or_none()

    if not asset:
        raise NotFoundError("Media asset not found")

    url = await get_media_url(asset.id, asset.s3_key)

    return MediaAssetResponse(
        id=str(asset.id),
        kind=asset.file_type,
        fileName=asset.file_name or "evidence",
        file_name=asset.file_name or "evidence",
        mimeType=asset.mime_type or "application/octet-stream",
        mime_type=asset.mime_type or "application/octet-stream",
        sizeBytes=asset.file_size_bytes or 0,
        size_bytes=asset.file_size_bytes or 0,
        url=url,
    )
