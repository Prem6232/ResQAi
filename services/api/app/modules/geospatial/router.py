from typing import Any, Dict, List, Literal
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.entities import User
from app.modules.admin import service as admin_service
from app.modules.admin.schemas import OperatingAreaResponse
from app.modules.auth.dependencies import get_current_user
from app.routing.engine import OSRMProvider

geospatial_router = APIRouter()


class RoutePathResponse(BaseModel):
    coordinates: List[List[float]]
    distanceKm: float
    durationMinutes: int
    source: str
    liveTraffic: bool = False
    guaranteedSafe: bool = False


@geospatial_router.get(
    "/routing/route",
    response_model=RoutePathResponse,
    summary="Calculate campus/road route path via OSRM with straight-line fallback",
)
async def get_route_path(
    from_lat: float = Query(..., ge=-90.0, le=90.0),
    from_lng: float = Query(..., ge=-180.0, le=180.0),
    to_lat: float = Query(..., ge=-90.0, le=90.0),
    to_lng: float = Query(..., ge=-180.0, le=180.0),
    profile: Literal["foot", "driving", "bike"] = Query(default="foot"),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Proxy OSRM route path geometry so responders see campus walkway/road routing."""
    provider = OSRMProvider(settings.OSRM_BASE_URL)
    return await provider.calculate_path(from_lat, from_lng, to_lat, to_lng, profile=profile)


@geospatial_router.get(
    "/operating-area",
    response_model=OperatingAreaResponse,
    summary="Get active campus geofence boundary polygon (all authenticated roles)",
)
async def get_public_operating_area(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OperatingAreaResponse:
    """Allow citizens, responders, operators, and admins to read active campus perimeter."""
    return await admin_service.get_active_operating_area(session=db)
