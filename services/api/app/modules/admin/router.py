import uuid
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Request, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.modules.auth.dependencies import require_roles
from app.modules.admin.schemas import (
    ResponderAdminOut,
    ResponderApprovalRequest,
    OperatingAreaResponse,
    PolygonUpdateRequest,
    AuditLogListResponse,
    DrillModeRequest,
    DrillModeResponse,
)
from app.modules.admin import service

router = APIRouter()

@router.get(
    "/responders",
    response_model=List[ResponderAdminOut],
    summary="List all responders with verification status (Admin only)",
)
async def get_all_responders(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"])),
):
    """List all registered responder units and their vetting status."""
    return await service.list_all_responders(session=db)

@router.post(
    "/responders/{responder_id}/approve",
    response_model=ResponderAdminOut,
    summary="Approve or revoke responder credentials (Admin only)",
)
async def approve_responder(
    responder_id: str,
    payload: ResponderApprovalRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"])),
):
    """Approve or revoke a responder profile. Emits immutable audit log."""
    ip_addr = request.client.host if request.client else None
    return await service.approve_or_revoke_responder(
        session=db,
        responder_id=responder_id,
        approved=payload.approved,
        admin_user=admin_user,
        ip_address=ip_addr,
    )

@router.get(
    "/operating-area",
    response_model=OperatingAreaResponse,
    summary="Get campus geofence boundary polygon (Admin & Operator)",
)
async def get_campus_operating_area(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "operator"])),
):
    """Retrieve active campus boundary geofence polygon."""
    return await service.get_active_operating_area(session=db)

@router.put(
    "/operating-area",
    response_model=OperatingAreaResponse,
    summary="Update campus geofence boundary polygon (Admin only)",
)
async def update_campus_operating_area(
    payload: PolygonUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"])),
):
    """
    Update campus geofence boundary polygon with validation.
    Rejects self-intersecting or invalid polygons with HTTP 400.
    """
    ip_addr = request.client.host if request.client else None
    return await service.update_campus_operating_area(
        session=db,
        req=payload,
        admin_user=admin_user,
        ip_address=ip_addr,
    )

@router.get(
    "/audit-logs",
    response_model=AuditLogListResponse,
    summary="Searchable audit trail with filters (Admin & Operator)",
)
async def get_audit_logs(
    actor: Optional[str] = Query(None, description="Filter by actor email"),
    action: Optional[str] = Query(None, description="Filter by action code"),
    target: Optional[str] = Query(None, description="Filter by target id or entity"),
    target_entity: Optional[str] = Query(None, description="Filter by target entity type"),
    since: Optional[datetime] = Query(None, description="Filter records created after timestamp"),
    until: Optional[datetime] = Query(None, description="Filter records created before timestamp"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "operator"])),
):
    """Query system-wide immutable audit trail."""
    return await service.search_audit_logs(
        session=db,
        actor=actor,
        action=action,
        target=target,
        target_entity=target_entity,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )

@router.post(
    "/drill-mode",
    response_model=DrillModeResponse,
    summary="Toggle simulated drill mode state (Admin only)",
)
async def toggle_drill_mode(
    payload: DrillModeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"])),
):
    """Toggle simulated drill mode state across the platform."""
    ip_addr = request.client.host if request.client else None
    return await service.toggle_system_drill_mode(
        session=db,
        enabled=payload.is_enabled(),
        admin_user=admin_user,
        ip_address=ip_addr,
    )
