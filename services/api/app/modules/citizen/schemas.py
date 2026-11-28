from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Any
from app.modules.media.schemas import MediaAssetResponse

class GeoPointInput(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: Optional[float] = None
    accuracyMeters: Optional[float] = None
    source: Optional[str] = Field(default="gps", description="gps, manual_map, unknown")

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("accuracy_meters") and data.get("accuracyMeters"):
                data["accuracy_meters"] = data["accuracyMeters"]
        return data

class SOSRequest(BaseModel):
    location: GeoPointInput
    location_label: Optional[str] = Field(default="Coordinates Broadcasted")
    locationLabel: Optional[str] = None
    note: Optional[str] = None
    idempotency_key: Optional[str] = None
    idempotencyKey: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("location_label") and data.get("locationLabel"):
                data["location_label"] = data["locationLabel"]
            if not data.get("idempotency_key") and data.get("idempotencyKey"):
                data["idempotency_key"] = data["idempotencyKey"]
        return data

class ReportCreateRequest(BaseModel):
    category: str = Field(..., description="fire_smoke, road_accident, medical, personal_safety, water_flood, hazard, other")
    text: str = Field(default="")
    location: GeoPointInput
    location_label: Optional[str] = None
    locationLabel: Optional[str] = None
    channel: Optional[str] = Field(default="form", description="sos, form, voice")
    urgency: Optional[str] = Field(default="high", description="low, medium, high, critical")
    idempotency_key: Optional[str] = None
    idempotencyKey: Optional[str] = None
    media_asset_ids: Optional[List[str]] = Field(default_factory=list)
    mediaAssetIds: Optional[List[str]] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cat = str(data.get("category") or "").strip().lower()
            if cat in {"personal_sos", "sos"}:
                data["category"] = "personal_safety"
            if not data.get("location_label") and data.get("locationLabel"):
                data["location_label"] = data["locationLabel"]
            if not data.get("idempotency_key") and data.get("idempotencyKey"):
                data["idempotency_key"] = data["idempotencyKey"]
            if not data.get("media_asset_ids") and data.get("mediaAssetIds"):
                data["media_asset_ids"] = data["mediaAssetIds"]
        return data

    @model_validator(mode="after")
    def ensure_text_or_media(self) -> "ReportCreateRequest":
        has_text = bool(self.text and self.text.strip())
        has_media = bool(self.media_asset_ids and len(self.media_asset_ids) > 0)
        if not has_text and not has_media:
            raise ValueError("Either report text or at least one attached media asset is required.")
        return self


class TriagePreviewRequest(BaseModel):
    text: str = Field(..., min_length=1)

class CancelReportRequest(BaseModel):
    reason: Optional[str] = Field(default="Accidental report / situation resolved")

class TrustedContactCreate(BaseModel):
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=5)
    relationship_label: Optional[str] = None
    relationshipLabel: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def reconcile(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("relationship_label") and data.get("relationshipLabel"):
                data["relationship_label"] = data["relationshipLabel"]
        return data

class TrustedContactResponse(BaseModel):
    id: str
    user_id: str
    name: str
    phone: str
    relationship_label: Optional[str] = None
    relationshipLabel: Optional[str] = None
    is_active: bool = True

class NearbyAlertResponse(BaseModel):
    id: str
    category: str
    title: str
    distanceLabel: str
    distance_label: str
    statusLabel: str
    status_label: str
    tone: str # active, warning, info
    coarsened: bool = True
    location: Optional[dict] = None

class ReportResponse(BaseModel):
    id: str
    reporterId: str
    reporter_id: str
    createdAt: str
    created_at: str
    channel: str
    category: str
    urgency: str
    text: str
    location: dict
    locationLabel: str
    location_label: str
    media: List[MediaAssetResponse] = []
    processingState: str
    processing_state: str
    deliveryState: str
    delivery_state: str
    incidentId: Optional[str] = None
    incident_id: Optional[str] = None
    cancelledReason: Optional[str] = None
    cancelled_reason: Optional[str] = None
    synthetic: bool = True

class PrivacyDeletionRequest(BaseModel):
    reason: Optional[str] = Field(default="Citizen requested personal data deletion")

class PrivacyDeletionResponse(BaseModel):
    ok: bool = True
    requestId: str
    status: str = "queued"
    recordedAt: str
    message: str

