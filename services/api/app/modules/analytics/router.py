from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.modules.auth.dependencies import require_roles
from app.modules.analytics.schemas import (
    AnalyticsSummary,
    HotspotFeatureCollection,
    CategoryBreakdown,
    ResponseTimeStats,
)
from app.modules.analytics import service

router = APIRouter()

@router.get(
    "/summary",
    response_model=AnalyticsSummary,
    summary="High-level operational and drill KPI metrics (Operator & Admin)",
)
async def get_summary_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"])),
):
    """Retrieve arrival times, active units, false alarm rates, and open queue volume."""
    return await service.get_analytics_summary(session=db)

@router.get(
    "/hotspots",
    response_model=HotspotFeatureCollection,
    summary="Incident spatial cluster density as GeoJSON FeatureCollection (Operator & Admin)",
)
async def get_hotspots(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"])),
):
    """Retrieve geospatial incident density points for heatmap rendering."""
    return await service.get_incident_hotspots(session=db)

@router.get(
    "/by-category",
    response_model=CategoryBreakdown,
    summary="Incident breakdown grouped by category (Operator & Admin)",
)
async def get_by_category(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"])),
):
    """Retrieve category distribution and percentages."""
    return await service.get_category_breakdown(session=db)

@router.get(
    "/response-times",
    response_model=ResponseTimeStats,
    summary="Response milestones and daily performance timeline (Operator & Admin)",
)
async def get_response_times(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"])),
):
    """Retrieve response phase milestones and time-series performance data."""
    return await service.get_response_time_stats(session=db)
