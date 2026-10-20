from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.models.entities import User
from app.modules.citizen.schemas import NearbyAlertResponse
from app.modules.citizen.service import get_nearby_alerts

alerts_router = APIRouter()

@alerts_router.get(
    "/nearby",
    response_model=List[NearbyAlertResponse],
    status_code=status.HTTP_200_OK,
    summary="Fetch nearby public campus alerts"
)
async def fetch_nearby_alerts(
    lat: float = Query(default=28.5452, ge=-90.0, le=90.0),
    lng: float = Query(default=77.2731, ge=-180.0, le=180.0),
    radius_km: float = Query(default=5.0, ge=0.1, le=50.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return active incidents near the specified coordinates.
    All public coordinates are automatically coarsened to a ~100m grid for privacy.
    """
    return await get_nearby_alerts(db, lat=lat, lng=lng, radius_km=radius_km)
