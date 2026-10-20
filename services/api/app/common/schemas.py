from typing import Optional, List, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class GeoPoint(BaseModel):
    lat: float = Field(..., description="Latitude coordinate", ge=-90.0, le=90.0)
    lng: float = Field(..., description="Longitude coordinate", ge=-180.0, le=180.0)
    accuracyMeters: Optional[float] = Field(None, description="GPS horizontal accuracy in meters")
    source: str = Field("gps", description="Source of coordinate: gps | manual_map | simulated | unknown")

class ApiErrorResponse(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error explanation")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T] = Field(default_factory=list)
    nextCursor: Optional[str] = Field(None, description="Cursor for fetching next page")

class StatusOkResponse(BaseModel):
    ok: bool = True
