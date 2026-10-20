from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.models.entities import User
from app.modules.citizen.schemas import (
    SOSRequest,
    ReportCreateRequest,
    ReportResponse,
    CancelReportRequest,
)
from app.modules.citizen.service import (
    create_sos_beacon,
    create_citizen_report,
    list_citizen_reports,
    get_citizen_report,
    cancel_citizen_report,
)

router = APIRouter()

@router.post(
    "/sos",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Trigger emergency SOS beacon"
)
async def submit_sos(
    payload: SOSRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sub-second emergency SOS beacon submission.
    Persists report and queues transactional outbox event.
    """
    report_resp, created = await create_sos_beacon(db, current_user, payload)
    return report_resp

@router.post(
    "/reports",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit structured incident report"
)
async def submit_report(
    payload: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit detailed incident report with category, location, and optional media.
    Deduplicates retried offline submissions via idempotencyKey.
    """
    report_resp, created = await create_citizen_report(db, current_user, payload)
    return report_resp

@router.get(
    "/reports",
    response_model=List[ReportResponse],
    status_code=status.HTTP_200_OK,
    summary="List citizen's own submitted reports"
)
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Return all reports submitted by the authenticated citizen.
    Citizens cannot access reports submitted by other users.
    """
    return await list_citizen_reports(db, current_user)

@router.get(
    "/reports/{id}",
    response_model=ReportResponse,
    status_code=status.HTTP_200_OK,
    summary="Get single report receipt"
)
async def get_report(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch details and delivery state for a specific report receipt.
    """
    return await get_citizen_report(db, current_user, id)

@router.post(
    "/reports/{id}/cancel",
    response_model=ReportResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel submitted report before dispatch"
)
async def cancel_report(
    id: str,
    payload: CancelReportRequest = CancelReportRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancel a report if the linked incident has not yet been dispatched or confirmed.
    """
    return await cancel_citizen_report(db, current_user, id, payload.reason)
