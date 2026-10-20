from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from app.core.database import get_db
from app.modules.auth.dependencies import require_roles
from app.models.entities import User
from app.modules.citizen.schemas import ReportResponse
from app.modules.operator.schemas import IncidentResponse, IncidentDetailResponse
from app.modules.operator.service import (
    get_report_triage_queue,
    get_active_incidents_list,
    get_incident_detail,
    get_responders_roster,
    get_dispatch_recommendations,
)
from app.modules.responder.schemas import DispatchRecommendation

router = APIRouter()

@router.get(
    "/reports/queue",
    response_model=List[ReportResponse],
    status_code=status.HTTP_200_OK,
    summary="Get unreviewed incoming report triage queue"
)
async def get_report_queue(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Return all reports awaiting operator review.
    Accessible strictly by Operators and Admins.
    """
    return await get_report_triage_queue(db)

@router.get(
    "/incidents",
    response_model=List[IncidentResponse],
    status_code=status.HTTP_200_OK,
    summary="List active incidents sorted by urgency priority"
)
async def get_active_incidents(
    status: Optional[str] = Query(default=None, description="Optional status filter"),
    category: Optional[str] = Query(default=None, description="Optional category filter"),
    urgency: Optional[str] = Query(default=None, description="Optional urgency filter"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Fetch active incidents sorted by urgency (critical > high > medium > low), then created_at DESC.
    """
    return await get_active_incidents_list(db, status, category, urgency)

@router.get(
    "/incidents/{id}",
    response_model=IncidentDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get incident detail workspace view"
)
async def get_incident(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Fetch comprehensive workspace view: incident details, linked reports,
    evidence assessments, responder assignments, and audit timeline.
    """
    return await get_incident_detail(db, id)

@router.get(
    "/responders",
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
    summary="List active responders roster with locations"
)
async def get_responders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Return list of vetted, active responders and their current telemetry coordinates.
    """
    return await get_responders_roster(db)

@router.get(
    "/incidents/{id}/recommendations",
    response_model=List[DispatchRecommendation],
    status_code=status.HTTP_200_OK,
    summary="Get ranked dispatch recommendations for an incident"
)
async def get_incident_dispatch_recommendations(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Rank vetted, on-duty responders by capability match and distance to incident.
    """
    return await get_dispatch_recommendations(db, id)

