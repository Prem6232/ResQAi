import uuid
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.models.responder import ResponderProfile
from app.models.operating_area import OperatingArea
from app.models.audit import AuditLog
from app.models.user import User
from app.common.spatial import (
    wkb_to_geopoint,
    wkb_to_geojson_polygon,
    geojson_to_wkt_polygon,
)
from app.core.redis import get_redis_client
from app.modules.admin.schemas import (
    ResponderAdminOut,
    ResponderAdminUserOut,
    OperatingAreaResponse,
    PolygonUpdateRequest,
    AuditLogOut,
    AuditLogListResponse,
    DrillModeResponse,
)

async def get_drill_mode_state(session: AsyncSession) -> bool:
    """Resolve current drill mode from Redis, falling back to the latest AuditLog entry in Postgres."""
    try:
        r = get_redis_client()
        drill_val = await r.get("system:drill_mode")
        if drill_val is not None:
            return drill_val != "false"
    except Exception:
        pass

    stmt = (
        select(AuditLog)
        .where(AuditLog.action == "TOGGLE_DRILL_MODE")
        .order_by(desc(AuditLog.created_at))
        .limit(1)
    )
    latest_toggle = (await session.execute(stmt)).scalar_one_or_none()
    if latest_toggle and isinstance(latest_toggle.details, dict) and "drill_mode" in latest_toggle.details:
        return bool(latest_toggle.details["drill_mode"])
    return True


async def list_all_responders(session: AsyncSession) -> List[ResponderAdminOut]:
    """Retrieve all responder profiles with joined user account metadata."""
    is_drill = await get_drill_mode_state(session)
    stmt = (
        select(ResponderProfile)
        .options(selectinload(ResponderProfile.user))
        .order_by(ResponderProfile.is_approved.asc(), ResponderProfile.unit_code.asc())
    )
    result = await session.execute(stmt)
    profiles = result.scalars().all()

    out = []
    for p in profiles:
        user_out = None
        if p.user:
            user_out = ResponderAdminUserOut(
                id=p.user.id,
                email=p.user.email,
                full_name=p.user.full_name,
                phone=p.user.phone,
            )
        loc = wkb_to_geopoint(p.last_known_location)
        out.append(
            ResponderAdminOut(
                id=p.id,
                user_id=p.user_id,
                unit_code=p.unit_code,
                display_name=p.display_name,
                responder_type=p.responder_type,
                capabilities=p.capabilities or [],
                is_on_duty=p.is_on_duty,
                availability_status=p.availability_status,
                share_location=p.share_location,
                is_approved=p.is_approved,
                approved=p.is_approved,
                synthetic=is_drill,
                last_ping_at=p.last_ping_at,
                last_known_location=loc,
                created_at=p.created_at,
                user=user_out,
            )
        )
    return out

async def approve_or_revoke_responder(
    session: AsyncSession,
    responder_id: Union[uuid.UUID, str],
    approved: bool,
    admin_user: User,
    ip_address: Optional[str] = None,
) -> ResponderAdminOut:
    """Approve or revoke a responder profile and emit an immutable audit record."""
    try:
        r_uuid = uuid.UUID(str(responder_id))
        cond = or_(ResponderProfile.id == r_uuid, ResponderProfile.user_id == r_uuid)
    except (ValueError, AttributeError):
        cond = (ResponderProfile.unit_code == str(responder_id))

    stmt = (
        select(ResponderProfile)
        .options(selectinload(ResponderProfile.user))
        .where(cond)
    )
    result = await session.execute(stmt)
    profile = result.scalar_one_or_none()

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Responder profile {responder_id} not found."
        )

    profile.is_approved = approved

    # Audit log
    action = "APPROVE_RESPONDER" if approved else "REVOKE_RESPONDER"
    audit = AuditLog(
        user_id=admin_user.id,
        actor_email=admin_user.email,
        action=action,
        target_entity="ResponderProfile",
        target_id=str(profile.id),
        details={"unit_code": profile.unit_code, "approved": approved},
        ip_address=ip_address,
    )
    session.add(audit)
    await session.commit()
    await session.refresh(profile)

    user_out = None
    if profile.user:
        user_out = ResponderAdminUserOut(
            id=profile.user.id,
            email=profile.user.email,
            full_name=profile.user.full_name,
            phone=profile.user.phone,
        )

    is_drill = await get_drill_mode_state(session)
    return ResponderAdminOut(
        id=profile.id,
        user_id=profile.user_id,
        unit_code=profile.unit_code,
        display_name=profile.display_name,
        responder_type=profile.responder_type,
        capabilities=profile.capabilities or [],
        is_on_duty=profile.is_on_duty,
        availability_status=profile.availability_status,
        share_location=profile.share_location,
        is_approved=profile.is_approved,
        approved=profile.is_approved,
        synthetic=is_drill,
        last_ping_at=profile.last_ping_at,
        last_known_location=wkb_to_geopoint(profile.last_known_location),
        created_at=profile.created_at,
        user=user_out,
    )

async def get_active_operating_area(session: AsyncSession) -> OperatingAreaResponse:
    """Get the active operating area polygon or initialize the Bhopal Metropolitan Safety Grid."""
    stmt = select(OperatingArea).where(OperatingArea.is_active == True).order_by(OperatingArea.created_at.desc())
    result = await session.execute(stmt)
    area = result.scalar_one_or_none()

    if not area:
        # Fallback default Bhopal Metropolitan Safety Grid polygon
        default_geojson = {
            "type": "Polygon",
            "coordinates": [[
                [77.3000, 23.1600],
                [77.5300, 23.1600],
                [77.5300, 23.3500],
                [77.3000, 23.3500],
                [77.3000, 23.1600]
            ]]
        }
        wkt_str = geojson_to_wkt_polygon(default_geojson)
        area = OperatingArea(
            name="Bhopal Metropolitan Safety Grid",
            boundary=wkt_str,
            is_active=True,
        )
        session.add(area)
        await session.commit()
        await session.refresh(area)

    geojson_dict = wkb_to_geojson_polygon(area.boundary) or {
        "type": "Polygon",
        "coordinates": [[
            [77.3000, 23.1600],
            [77.5300, 23.1600],
            [77.5300, 23.3500],
            [77.3000, 23.3500],
            [77.3000, 23.1600]
        ]]
    }
    coords = geojson_dict.get("coordinates", [[]])[0]

    return OperatingAreaResponse(
        id=area.id,
        name=area.name,
        polygon=coords,
        srid=4326,
        is_active=area.is_active,
        created_at=area.created_at,
        geojson=geojson_dict,
    )

async def update_campus_operating_area(
    session: AsyncSession,
    req: PolygonUpdateRequest,
    admin_user: User,
    ip_address: Optional[str] = None,
) -> OperatingAreaResponse:
    """
    Validate and update campus geofence boundary polygon.
    Rejects self-intersecting or invalid polygons with HTTP 400.
    """
    geojson_to_use = req.geojson

    if not geojson_to_use and req.polygon:
        ring = list(req.polygon)
        if len(ring) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Polygon requires at least 3 points to form an area."
            )
        # Ensure closed ring
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        geojson_to_use = {"type": "Polygon", "coordinates": [ring]}

    if not geojson_to_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No polygon or geojson coordinates provided."
        )

    try:
        wkt_poly = geojson_to_wkt_polygon(geojson_to_use)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid geofence polygon: {str(e)}"
        )

    stmt = select(OperatingArea).where(OperatingArea.is_active == True).order_by(OperatingArea.created_at.desc())
    result = await session.execute(stmt)
    area = result.scalar_one_or_none()

    area_name = req.name or (area.name if area else "Bhopal Metropolitan Safety Grid")
    if area:
        area.name = area_name
        area.boundary = wkt_poly
    else:
        area = OperatingArea(
            name=area_name,
            boundary=wkt_poly,
            is_active=True,
        )
        session.add(area)

    audit = AuditLog(
        user_id=admin_user.id,
        actor_email=admin_user.email,
        action="UPDATE_CAMPUS_POLYGON",
        target_entity="OperatingArea",
        target_id=str(area.id),
        details={"name": area_name},
        ip_address=ip_address,
    )
    session.add(audit)
    await session.commit()
    await session.refresh(area)

    geojson_dict = wkb_to_geojson_polygon(area.boundary) or geojson_to_use
    coords = geojson_dict.get("coordinates", [[]])[0]

    return OperatingAreaResponse(
        id=area.id,
        name=area.name,
        polygon=coords,
        srid=4326,
        is_active=area.is_active,
        created_at=area.created_at,
        geojson=geojson_dict,
    )

async def search_audit_logs(
    session: AsyncSession,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    target: Optional[str] = None,
    target_entity: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> AuditLogListResponse:
    """Query searchable audit trail with filtering and pagination."""
    query = select(AuditLog)

    if actor:
        query = query.where(AuditLog.actor_email.ilike(f"%{actor}%"))
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if target_entity:
        query = query.where(AuditLog.target_entity.ilike(f"%{target_entity}%"))
    if target:
        query = query.where(
            or_(
                AuditLog.target_id.ilike(f"%{target}%"),
                AuditLog.target_entity.ilike(f"%{target}%")
            )
        )
    if since:
        query = query.where(AuditLog.created_at >= since)
    if until:
        query = query.where(AuditLog.created_at <= until)

    # Count total
    count_stmt = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    # Paginate
    query = query.order_by(desc(AuditLog.created_at)).limit(min(limit, 200)).offset(offset)
    result = await session.execute(query)
    logs = result.scalars().all()
    is_drill = await get_drill_mode_state(session)

    items = []
    for log in logs:
        items.append(
            AuditLogOut(
                id=log.id,
                at=log.created_at,
                created_at=log.created_at,
                actor=log.actor_email or "system",
                actor_email=log.actor_email,
                action=log.action,
                target=f"{log.target_entity}:{log.target_id}",
                target_entity=log.target_entity,
                target_id=log.target_id,
                details=log.details or {},
                ip_address=log.ip_address,
                synthetic=is_drill,
            )
        )

    return AuditLogListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )

async def toggle_system_drill_mode(
    session: AsyncSession,
    enabled: bool,
    admin_user: User,
    ip_address: Optional[str] = None,
) -> DrillModeResponse:
    """Toggle simulated drill mode state and log the action."""
    try:
        r = get_redis_client()
        await r.set("system:drill_mode", "true" if enabled else "false")
    except Exception:
        pass

    audit = AuditLog(
        user_id=admin_user.id,
        actor_email=admin_user.email,
        action="TOGGLE_DRILL_MODE",
        target_entity="System",
        target_id="global",
        details={"drill_mode": enabled},
        ip_address=ip_address,
    )
    session.add(audit)
    await session.commit()

    return DrillModeResponse(ok=True, drill_mode=enabled)
