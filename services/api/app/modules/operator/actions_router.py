from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import require_roles
from app.models.entities import User
from app.modules.operator.schemas import (
    IncidentResponse,
    MergeRequest,
    SplitRequest,
    StateTransitionRequest,
    AIAssessmentOverrideRequest,
)
from app.modules.responder.schemas import DispatchOfferRequest
from app.modules.operator.service import (
    merge_reports_action,
    split_report_action,
    advance_incident_state,
    override_ai_assessment_action,
    build_incident_response,
)

actions_router = APIRouter()

@actions_router.post(
    "/merge",
    response_model=IncidentResponse,
    status_code=status.HTTP_200_OK,
    summary="Merge multiple reports into a target incident"
)
async def merge_reports(
    payload: MergeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Merge multiple report IDs into a single target incident.
    Preserves all evidence, notes, and writes to immutable audit_logs.
    """
    updated_incident = await merge_reports_action(
        db=db,
        user=current_user,
        target_incident_id=payload.target_id,
        report_ids=payload.reports,
        reason=payload.reason,
    )
    return build_incident_response(updated_incident)

@actions_router.post(
    "/split",
    response_model=IncidentResponse,
    status_code=status.HTTP_200_OK,
    summary="Split report out to form a new incident"
)
async def split_report(
    payload: SplitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Detach a report incorrectly grouped with an incident and spawn a separate incident.
    Writes immutable audit log.
    """
    new_incident = await split_report_action(
        db=db,
        user=current_user,
        report_id=payload.rep_id,
        reason=payload.reason,
    )
    return build_incident_response(new_incident)

@actions_router.post(
    "/state",
    response_model=IncidentResponse,
    status_code=status.HTTP_200_OK,
    summary="Advance incident state machine"
)
async def update_state(
    payload: StateTransitionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Advance incident lifecycle according to Section 2.2.B transition table.
    Rejects illegal jumps (e.g. resolved -> en_route) with HTTP 400.
    """
    updated_incident = await advance_incident_state(
        db=db,
        user=current_user,
        incident_id=payload.inc_id,
        to_status=payload.target_status,
        reason=payload.reason,
    )
    return build_incident_response(updated_incident)

@actions_router.post(
    "/override",
    response_model=IncidentResponse,
    status_code=status.HTTP_200_OK,
    summary="Override AI category or urgency assessment"
)
async def override_ai(
    payload: AIAssessmentOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Human-in-the-Loop AI override: human operator re-classifies category or urgency.
    Writes immutable OVERRIDE_AI audit record.
    """
    updated_incident = await override_ai_assessment_action(
        db=db,
        user=current_user,
        incident_id=payload.inc_id,
        category=payload.category,
        urgency=payload.urgency,
        reason=payload.reason,
    )
    return build_incident_response(updated_incident)

@actions_router.post(
    "/dispatch",
    status_code=status.HTTP_201_CREATED,
    summary="Operator issues dispatch offer to responder unit"
)
async def dispatch_responder(
    payload: DispatchOfferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["operator", "admin"]))
):
    """
    Operator issues a 90-second response offer to an approved responder unit.
    Advances incident status to assigned and writes immutable audit log.
    """
    from app.modules.operator.service import dispatch_responder_offer
    from app.modules.responder.service import build_assignment_response

    assignment = await dispatch_responder_offer(
        db=db,
        user=current_user,
        incident_id=payload.target_incident_id,
        responder_id=payload.target_responder_id,
        note=payload.note,
    )
    return build_assignment_response(assignment)
