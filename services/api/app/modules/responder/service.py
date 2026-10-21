import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppException, NotFoundError, ForbiddenError
from app.core.outbox import create_outbox_event
from app.common.spatial import point_to_wkt, extract_lat_lng
from app.routing.engine import calculate_route
from app.models.entities import (
    User,
    ResponderProfile,
    Assignment,
    AssignmentEvent,
    Incident,
    IncidentStatusEvent,
    AuditLog,
)
from app.modules.responder.schemas import (
    AssignmentResponse,
    AssignmentEventResponse,
    LocationPingRequest,
    DutyUpdateRequest,
    DispatchRecommendation,
)

logger = logging.getLogger("sentinelgrid.responder.service")

# State transition matrix defined in Section 2.2.C of Backend Build Pack
ALLOWED_ASSIGNMENT_TRANSITIONS: Dict[str, List[str]] = {
    "offered": ["accepted", "declined", "cancelled", "expired"],
    "accepted": ["en_route", "failed", "cancelled"],
    "en_route": ["arrived", "on_scene", "failed", "cancelled"],
    "arrived": ["completed", "failed"],
    "on_scene": ["completed", "failed"],
    "completed": [],
    "declined": [],
    "cancelled": [],
    "expired": [],
    "failed": [],
}

def build_assignment_response(asg: Assignment) -> AssignmentResponse:
    """Serialize Assignment entity to schema matching frontend contract."""
    from sqlalchemy.orm import attributes
    state = attributes.instance_state(asg)

    incident_dict = None
    loaded_inc = state.dict.get("incident")
    if loaded_inc:
        lat, lng = extract_lat_lng(loaded_inc.location)
        incident_dict = {
            "id": str(loaded_inc.id),
            "publicCode": loaded_inc.public_code,
            "title": loaded_inc.title,
            "category": loaded_inc.category,
            "urgency": loaded_inc.urgency,
            "status": loaded_inc.status,
            "location": {"lat": lat, "lng": lng},
            "locationLabel": loaded_inc.location_label or "Campus Area",
        }

    offered_iso = asg.offered_at.replace(tzinfo=timezone.utc).isoformat() if asg.offered_at else datetime.now(timezone.utc).isoformat()
    ack_iso = asg.acknowledged_at.replace(tzinfo=timezone.utc).isoformat() if asg.acknowledged_at else None
    comp_iso = asg.completed_at.replace(tzinfo=timezone.utc).isoformat() if asg.completed_at else None
    deadline_iso = asg.offer_deadline.replace(tzinfo=timezone.utc).isoformat() if asg.offer_deadline else None

    return AssignmentResponse(
        id=str(asg.id),
        incidentId=str(asg.incident_id),
        incident_id=str(asg.incident_id),
        responderId=str(asg.responder_id),
        responder_id=str(asg.responder_id),
        slotId=str(asg.id),
        status=asg.status,
        offeredAt=offered_iso,
        offered_at=offered_iso,
        offerDeadline=deadline_iso,
        offer_deadline=deadline_iso,
        acknowledgedAt=ack_iso,
        acknowledged_at=ack_iso,
        completedAt=comp_iso,
        completed_at=comp_iso,
        etaMinutes=asg.eta_minutes,
        eta_minutes=asg.eta_minutes,
        distanceKm=asg.distance_km,
        distance_km=asg.distance_km,
        routeNote=asg.route_note,
        route_note=asg.route_note,
        incident=incident_dict,
        synthetic=True,
    )

async def get_responder_profile_for_user(db: AsyncSession, user: User) -> ResponderProfile:
    """Fetch responder profile for authenticated user with vetting verification."""
    stmt = select(ResponderProfile).where(ResponderProfile.user_id == user.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        raise NotFoundError("Responder profile not found for this account")
    return profile

async def get_active_assignments_for_user(db: AsyncSession, user: User) -> List[AssignmentResponse]:
    """Return active assignments for authenticated responder, expiring timed out offers."""
    stmt_prof = select(ResponderProfile).where(ResponderProfile.user_id == user.id)
    profile = (await db.execute(stmt_prof)).scalar_one_or_none()
    if not profile:
        if user.role in ["admin", "operator"]:
            return []
        raise NotFoundError("Responder profile not found for this account")

    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events))
        .where(
            Assignment.responder_id == profile.id,
            Assignment.status.in_(["offered", "accepted", "en_route", "arrived", "on_scene"])
        )
        .order_by(Assignment.offered_at.desc())
    )
    assignments = (await db.execute(stmt)).scalars().all()

    now = datetime.utcnow()
    results = []
    has_expired = False

    for asg in assignments:
        if asg.status == "offered" and asg.offer_deadline and now > asg.offer_deadline:
            asg.status = "expired"
            profile.availability_status = "available"
            ev = AssignmentEvent(
                assignment_id=asg.id,
                from_status="offered",
                to_status="expired",
                note="Offer expired after 90 seconds deadline"
            )
            db.add(ev)
            has_expired = True
        else:
            results.append(build_assignment_response(asg))

    if has_expired:
        await db.commit()

    return results

async def get_assignment_history_for_user(db: AsyncSession, user: User) -> List[AssignmentResponse]:
    """Return past missions (completed, failed, cancelled, declined, expired)."""
    stmt_prof = select(ResponderProfile).where(ResponderProfile.user_id == user.id)
    profile = (await db.execute(stmt_prof)).scalar_one_or_none()
    if not profile:
        if user.role in ["admin", "operator"]:
            return []
        raise NotFoundError("Responder profile not found for this account")

    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events))
        .where(
            Assignment.responder_id == profile.id,
            Assignment.status.in_(["completed", "failed", "cancelled", "declined", "expired"])
        )
        .order_by(Assignment.offered_at.desc())
        .limit(50)
    )
    assignments = (await db.execute(stmt)).scalars().all()
    return [build_assignment_response(asg) for asg in assignments]

async def respond_to_assignment_offer(
    db: AsyncSession,
    user: User,
    assignment_id: str,
    accept: bool,
    reason: Optional[str] = None
) -> AssignmentResponse:
    """
    Responder accepts or declines dispatch offer.
    Enforces 90-second timeout, object-level authorization, and incident state coordination.
    """
    profile = await get_responder_profile_for_user(db, user)

    try:
        asg_uuid = uuid.UUID(assignment_id)
    except ValueError:
        raise NotFoundError("Invalid assignment ID format")

    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events))
        .where(Assignment.id == asg_uuid)
    )
    asg = (await db.execute(stmt)).scalar_one_or_none()

    if not asg:
        raise NotFoundError("Assignment not found")

    # Object-level permission: responder can only act on their own assignment
    if asg.responder_id != profile.id and user.role != "admin":
        raise ForbiddenError("You cannot modify assignments belonging to other units")

    if asg.status != "offered":
        raise AppException(400, "OFFER_NOT_ACTIVE", f"Assignment offer is in '{asg.status}' status, cannot respond")

    now = datetime.utcnow()
    if asg.offer_deadline and now > asg.offer_deadline:
        asg.status = "expired"
        profile.availability_status = "available"
        db.add(AssignmentEvent(assignment_id=asg.id, from_status="offered", to_status="expired", note="Offer expired"))
        await db.commit()
        raise AppException(400, "OFFER_EXPIRED", "The 90-second acceptance window has expired")

    if accept:
        asg.status = "accepted"
        asg.acknowledged_at = now
        profile.availability_status = "busy"
        
        # Link incident to assigned
        if asg.incident and asg.incident.status in ["reported", "under_review", "confirmed"]:
            asg.incident.status = "assigned"
            db.add(IncidentStatusEvent(
                incident_id=asg.incident.id,
                from_status=asg.incident.status,
                to_status="assigned",
                actor_id=user.id,
                actor_role="responder",
                note=f"Unit {profile.unit_code} accepted dispatch"
            ))

        action_name = "ACCEPT_OFFER"
        target_status = "accepted"
    else:
        asg.status = "declined"
        asg.acknowledged_at = now
        profile.availability_status = "available"
        action_name = "DECLINE_OFFER"
        target_status = "declined"

    db.add(AssignmentEvent(
        assignment_id=asg.id,
        from_status="offered",
        to_status=target_status,
        triggered_by_user_id=user.id,
        reason=reason,
        note=f"Responder {profile.unit_code} {target_status} offer"
    ))

    # Immutable audit
    db.add(AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action=action_name,
        target_entity="Assignment",
        target_id=str(asg.id),
        details={"status": target_status, "reason": reason},
    ))

    # Outbox event
    await create_outbox_event(
        session=db,
        aggregate_type="Assignment",
        aggregate_id=asg.id,
        event_type="assignment.updated",
        payload={
            "assignment_id": str(asg.id),
            "incident_id": str(asg.incident_id),
            "responder_id": str(profile.id),
            "unit_code": profile.unit_code,
            "status": target_status,
            "reason": reason,
        }
    )

    await db.commit()
    return build_assignment_response(asg)

async def update_assignment_status_action(
    db: AsyncSession,
    user: User,
    assignment_id: str,
    target_status: str,
    reason: Optional[str] = None,
    explanation: Optional[str] = None
) -> AssignmentResponse:
    """
    Transition assignment status enforcing Section 2.2.C matrix.
    Coordinates linked incident state and handles 'failed' mission escalation.
    """
    try:
        asg_uuid = uuid.UUID(assignment_id)
    except ValueError:
        raise NotFoundError("Invalid assignment ID format")

    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events), selectinload(Assignment.responder))
        .where(Assignment.id == asg_uuid)
    )
    asg = (await db.execute(stmt)).scalar_one_or_none()

    if not asg:
        raise NotFoundError("Assignment not found")

    # Normalize on_scene -> arrived
    normalized_target = "arrived" if target_status == "on_scene" else target_status
    current_status = asg.status

    # Authorization
    if user.role == "responder":
        profile = await get_responder_profile_for_user(db, user)
        if asg.responder_id != profile.id:
            raise ForbiddenError("Cannot modify assignments of other responder units")
    elif user.role not in ["operator", "admin"]:
        raise ForbiddenError("Unauthorized to transition assignment status")

    # State machine transition check
    allowed_next = ALLOWED_ASSIGNMENT_TRANSITIONS.get(current_status, [])
    if normalized_target not in allowed_next:
        raise AppException(
            400,
            "ILLEGAL_STATE_TRANSITION",
            f"Cannot transition assignment from '{current_status}' to '{normalized_target}'. Allowed: {allowed_next}"
        )

    now = datetime.utcnow()
    note_text = explanation or reason or f"Transition to {normalized_target}"

    if normalized_target == "failed":
        if not reason and not explanation:
            raise AppException(400, "REASON_REQUIRED", "Failure reason or explanation is mandatory when reporting a mission failure")
        asg.status = "failed"
        if asg.responder:
            asg.responder.availability_status = "available"
        
        # Trigger urgent outbox failure notification
        await create_outbox_event(
            session=db,
            aggregate_type="Assignment",
            aggregate_id=asg.id,
            event_type="assignment.failed",
            payload={
                "assignment_id": str(asg.id),
                "incident_id": str(asg.incident_id),
                "responder_id": str(asg.responder_id),
                "explanation": note_text,
            }
        )

    elif normalized_target == "completed":
        asg.status = "completed"
        asg.completed_at = now
        if asg.responder:
            asg.responder.availability_status = "available"

        # Advance incident if this was primary active mission
        if asg.incident:
            asg.incident.status = "resolved"
            asg.incident.resolved_at = now
            db.add(IncidentStatusEvent(
                incident_id=asg.incident.id,
                from_status="on_scene",
                to_status="resolved",
                actor_id=user.id,
                actor_role=user.role,
                note=f"Incident resolved by unit completion: {note_text}"
            ))

    elif normalized_target == "en_route":
        asg.status = "en_route"
        if asg.incident and asg.incident.status == "assigned":
            asg.incident.status = "en_route"
            db.add(IncidentStatusEvent(
                incident_id=asg.incident.id,
                from_status="assigned",
                to_status="en_route",
                actor_id=user.id,
                actor_role=user.role,
                note="Responder en route to scene"
            ))

    elif normalized_target in ["arrived", "on_scene"]:
        asg.status = "arrived"
        if asg.incident and asg.incident.status in ["assigned", "en_route"]:
            asg.incident.status = "on_scene"
            db.add(IncidentStatusEvent(
                incident_id=asg.incident.id,
                from_status=asg.incident.status,
                to_status="on_scene",
                actor_id=user.id,
                actor_role=user.role,
                note="Responder on scene"
            ))
    else:
        asg.status = normalized_target

    db.add(AssignmentEvent(
        assignment_id=asg.id,
        from_status=current_status,
        to_status=asg.status,
        triggered_by_user_id=user.id,
        reason=reason,
        note=note_text
    ))

    # Audit log
    db.add(AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="UPDATE_ASSIGNMENT_STATUS",
        target_entity="Assignment",
        target_id=str(asg.id),
        details={"from": current_status, "to": asg.status, "reason": note_text},
    ))

    # Outbox event
    await create_outbox_event(
        session=db,
        aggregate_type="Assignment",
        aggregate_id=asg.id,
        event_type="assignment.updated",
        payload={
            "assignment_id": str(asg.id),
            "incident_id": str(asg.incident_id),
            "from_status": current_status,
            "to_status": asg.status,
            "reason": note_text,
        }
    )

    await db.commit()
    return build_assignment_response(asg)

async def ingest_responder_location_ping(
    db: AsyncSession,
    user: User,
    lat: float,
    lng: float
) -> Dict[str, Any]:
    """Update responder GPS location telemetry and recalculate active mission ETA."""
    profile = await get_responder_profile_for_user(db, user)

    profile.last_known_location = point_to_wkt(lat, lng)
    profile.last_ping_at = datetime.utcnow()

    # Recalculate ETA for active en_route mission
    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident))
        .where(
            Assignment.responder_id == profile.id,
            Assignment.status == "en_route"
        )
        .order_by(Assignment.offered_at.desc())
    )
    active_asg = (await db.execute(stmt)).scalars().first()
    if active_asg and active_asg.incident:
        inc_lat, inc_lng = extract_lat_lng(active_asg.incident.location)
        dist_km, eta_min = calculate_route(lat, lng, inc_lat, inc_lng)
        active_asg.distance_km = dist_km
        active_asg.eta_minutes = eta_min

    await db.commit()
    return {
        "ok": True,
        "at": datetime.utcnow().replace(tzinfo=timezone.utc).isoformat(),
        "point": {"lat": lat, "lng": lng, "source": "gps"}
    }

async def append_assignment_notes(
    db: AsyncSession,
    user: User,
    assignment_id: str,
    notes: str
) -> AssignmentResponse:
    """Append operational notes to assignment."""
    try:
        asg_uuid = uuid.UUID(assignment_id)
    except ValueError:
        raise NotFoundError("Invalid assignment ID")

    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events))
        .where(Assignment.id == asg_uuid)
    )
    asg = (await db.execute(stmt)).scalar_one_or_none()
    if not asg:
        raise NotFoundError("Assignment not found")

    existing_notes = asg.route_note or ""
    timestamp = datetime.utcnow().strftime("%H:%M")
    asg.route_note = f"{existing_notes}\n[{timestamp} {user.full_name or user.email}]: {notes}".strip()

    db.add(AssignmentEvent(
        assignment_id=asg.id,
        from_status=asg.status,
        to_status=asg.status,
        triggered_by_user_id=user.id,
        note=notes
    ))

    await db.commit()
    return build_assignment_response(asg)

async def toggle_duty_status(
    db: AsyncSession,
    user: User,
    is_on_duty: Optional[bool] = None,
    availability_status: Optional[str] = None
) -> Dict[str, Any]:
    """Toggle responder on-duty state and availability."""
    profile = await get_responder_profile_for_user(db, user)

    if is_on_duty is not None:
        profile.is_on_duty = is_on_duty
        if not is_on_duty:
            profile.availability_status = "off_duty"
        elif profile.availability_status == "off_duty":
            profile.availability_status = "available"

    if availability_status is not None:
        profile.availability_status = availability_status
        if availability_status in ["available", "busy"]:
            profile.is_on_duty = True
        elif availability_status in ["off_duty", "offline"]:
            profile.is_on_duty = False

    await db.commit()
    return {
        "isOnDuty": profile.is_on_duty,
        "is_on_duty": profile.is_on_duty,
        "availabilityStatus": profile.availability_status,
        "availability_status": profile.availability_status,
    }

async def auto_expire_assignment_offers(db: AsyncSession) -> int:
    """
    Background worker/routine to expire all pending assignment offers
    that have exceeded their 90-second deadline.
    Emits assignment.expired outbox events and restores responder availability.
    """
    now = datetime.utcnow()
    stmt = (
        select(Assignment)
        .options(selectinload(Assignment.responder))
        .where(
            Assignment.status == "offered",
            Assignment.offer_deadline <= now
        )
    )
    expired_offers = (await db.execute(stmt)).scalars().all()
    if not expired_offers:
        return 0

    expired_count = 0
    for asg in expired_offers:
        asg.status = "expired"
        if asg.responder and asg.responder.availability_status == "busy":
            asg.responder.availability_status = "available"

        db.add(AssignmentEvent(
            assignment_id=asg.id,
            from_status="offered",
            to_status="expired",
            note="Offer expired automatically after 90 seconds response window"
        ))

        await create_outbox_event(
            session=db,
            aggregate_type="Assignment",
            aggregate_id=asg.id,
            event_type="assignment.expired",
            payload={
                "assignment_id": str(asg.id),
                "incident_id": str(asg.incident_id),
                "responder_id": str(asg.responder_id),
                "expired_at": now.isoformat(),
            }
        )
        expired_count += 1

    await db.commit()
    logger.info(f"Auto-expired {expired_count} pending assignment offer(s)")
    return expired_count

