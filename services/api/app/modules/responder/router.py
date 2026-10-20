from fastapi import APIRouter, Depends, status
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import require_roles, require_approved_responder
from app.models.entities import User
from app.modules.responder.schemas import (
    AssignmentResponse,
    OfferResponseRequest,
    AssignmentStatusUpdateRequest,
    LocationPingRequest,
    DutyUpdateRequest,
    AssignmentNotesRequest,
)
from app.modules.responder.service import (
    get_active_assignments_for_user,
    get_assignment_history_for_user,
    respond_to_assignment_offer,
    update_assignment_status_action,
    ingest_responder_location_ping,
    append_assignment_notes,
    toggle_duty_status,
)

responder_router = APIRouter()

@responder_router.get(
    "/assignments",
    response_model=List[AssignmentResponse],
    status_code=status.HTTP_200_OK,
    summary="Get active assignments for authenticated responder"
)
async def get_active_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """
    Fetch active assignments (offered, accepted, en_route, arrived).
    Automatically expires pending offers that have exceeded their 90-second timeout.
    """
    return await get_active_assignments_for_user(db, current_user)

@responder_router.get(
    "/history",
    response_model=List[AssignmentResponse],
    status_code=status.HTTP_200_OK,
    summary="Get mission history for authenticated responder"
)
async def get_assignment_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """Fetch past missions (completed, failed, cancelled, declined, expired)."""
    return await get_assignment_history_for_user(db, current_user)

@responder_router.post(
    "/offers/{assignment_id}/respond",
    response_model=AssignmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Accept or decline an offered mission"
)
async def respond_to_offer(
    assignment_id: str,
    payload: OfferResponseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """
    Accept or decline dispatch offer within 90-second response window.
    Object-level protection: responders cannot respond to other units' offers.
    """
    is_accept = (payload.status == "accepted")
    return await respond_to_assignment_offer(
        db=db,
        user=current_user,
        assignment_id=assignment_id,
        accept=is_accept,
        reason=payload.reason
    )

@responder_router.post(
    "/assignments/{assignment_id}/status",
    response_model=AssignmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Transition assignment status"
)
async def update_assignment_status(
    assignment_id: str,
    payload: AssignmentStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """
    Transition assignment status enforcing Section 2.2.C matrix.
    Transitions to 'failed' require mandatory rationale/explanation.
    """
    return await update_assignment_status_action(
        db=db,
        user=current_user,
        assignment_id=assignment_id,
        target_status=payload.status,
        reason=payload.reason,
        explanation=payload.explanation,
    )

@responder_router.post(
    "/location",
    status_code=status.HTTP_200_OK,
    summary="Ingest GPS location telemetry ping"
)
async def post_location_ping(
    payload: LocationPingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """
    Update responder last known location in PostGIS and recalculate ETA for active missions.
    """
    return await ingest_responder_location_ping(
        db=db,
        user=current_user,
        lat=payload.lat,
        lng=payload.lng
    )

@responder_router.post(
    "/assignments/{assignment_id}/notes",
    response_model=AssignmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Append operational notes to assignment"
)
async def append_notes(
    assignment_id: str,
    payload: AssignmentNotesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """Append operational notes and log AssignmentEvent."""
    return await append_assignment_notes(
        db=db,
        user=current_user,
        assignment_id=assignment_id,
        notes=payload.notes
    )

@responder_router.patch(
    "/duty",
    status_code=status.HTTP_200_OK,
    summary="Toggle duty and availability status"
)
async def update_duty(
    payload: DutyUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_approved_responder)
):
    """Toggle responder on-duty state and availability status."""
    return await toggle_duty_status(
        db=db,
        user=current_user,
        is_on_duty=payload.is_on_duty,
        availability_status=payload.availability_status
    )
