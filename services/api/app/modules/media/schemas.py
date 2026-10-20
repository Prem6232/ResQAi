from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any

class PresignedUrlRequest(BaseModel):
    file_name: str = Field(..., description="File name with extension")
    fileName: Optional[str] = None
    mime_type: str = Field(..., description="MIME type of file")
    mimeType: Optional[str] = None
    file_size_bytes: int = Field(..., description="Size in bytes, max 15MB")
    fileSizeBytes: Optional[int] = None
    report_id: Optional[str] = None
    reportId: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile_camel_case(cls, data: Any) -> Any:
        if isinstance(data, dict):
            fn = data.get("file_name") or data.get("fileName") or data.get("filename")
            if fn:
                data["file_name"] = fn
            mt = data.get("mime_type") or data.get("mimeType") or data.get("mimetype")
            if mt:
                data["mime_type"] = mt
            fs = (
                data.get("file_size_bytes")
                if data.get("file_size_bytes") is not None
                else data.get("fileSizeBytes")
                if data.get("fileSizeBytes") is not None
                else data.get("sizeBytes")
                if data.get("sizeBytes") is not None
                else data.get("size_bytes")
            )
            if fs is not None:
                data["file_size_bytes"] = fs
            rid = data.get("report_id") or data.get("reportId")
            if rid:
                data["report_id"] = rid
        return data

class PresignedUrlResponse(BaseModel):
    mediaAssetId: str
    media_asset_id: str
    uploadUrl: str
    upload_url: str
    expiresInSeconds: int = 900
    expires_in_seconds: int = 900

class MediaConfirmRequest(BaseModel):
    report_id: Optional[str] = None
    reportId: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("report_id") and data.get("reportId"):
                data["report_id"] = data["reportId"]
        return data

class MediaAssetResponse(BaseModel):
    id: str
    kind: str # image, audio, video
    fileName: str
    file_name: str
    mimeType: str
    mime_type: str
    sizeBytes: int
    size_bytes: int
    url: Optional[str] = None
