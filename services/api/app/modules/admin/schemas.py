import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from app.common.schemas import GeoPoint

class ResponderAdminUserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: Optional[str] = None

class ResponderAdminOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: uuid.UUID
    user_id: uuid.UUID = Field(alias="userId")
    unit_code: str = Field(alias="unitCode")
    display_name: str = Field(alias="displayName")
    responder_type: str = Field(alias="type")
    capabilities: List[str]
    is_on_duty: bool = Field(alias="isOnDuty")
    availability_status: str = Field(alias="status")
    share_location: bool = Field(alias="shareLocation")
    is_approved: bool = Field(alias="isApproved")
    approved: bool = True
    synthetic: bool = True
    last_ping_at: Optional[datetime] = Field(None, alias="lastLocationAt")
    last_known_location: Optional[GeoPoint] = Field(None, alias="lastLocation")
    created_at: datetime = Field(alias="createdAt")
    user: Optional[ResponderAdminUserOut] = None

class ResponderApprovalRequest(BaseModel):
    approved: bool = True

class OperatingAreaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: uuid.UUID
    name: str
    polygon: List[List[float]]
    srid: int = 4326
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")
    geojson: Optional[Dict[str, Any]] = None

class PolygonUpdateRequest(BaseModel):
    name: Optional[str] = None
    geojson: Optional[Dict[str, Any]] = None
    polygon: Optional[List[List[float]]] = None

class AuditLogOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: uuid.UUID
    at: datetime = Field(alias="createdAt")
    created_at: datetime
    actor: str
    actor_email: Optional[str] = Field(None, alias="actorEmail")
    action: str
    target: str
    target_entity: str = Field(alias="targetEntity")
    target_id: str = Field(alias="targetId")
    details: Dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    synthetic: bool = True

class AuditLogListResponse(BaseModel):
    items: List[AuditLogOut]
    total: int
    limit: int
    offset: int

class DrillModeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: Optional[bool] = None
    drill_mode: Optional[bool] = Field(None, alias="drillMode")

    def is_enabled(self) -> bool:
        if self.enabled is not None:
            return self.enabled
        if self.drill_mode is not None:
            return self.drill_mode
        return True

class DrillModeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ok: bool = True
    drill_mode: bool = Field(alias="drillMode")
