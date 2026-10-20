import uuid
import random
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, case
from sqlalchemy.orm import selectinload
from shapely.geometry import Point
from geoalchemy2.shape import to_shape, from_shape

from app.core.exceptions import AppException, NotFoundError, ForbiddenError
from app.core.outbox import create_outbox_event
from app.common.spatial import haversine_distance, haversine_distance_meters, extract_lat_lng
from app.routing.engine import calculate_route
from app.models.entities import (
    Incident,
    IncidentReport,
    IncidentStatusEvent,
    Report,
    Assignment,
    AssignmentEvent,
    AuditLog,
    ResponderProfile,
    User,
)
from app.modules.citizen.service import build_report_response
from app.modules.operator.schemas import (
    IncidentResponse,
    IncidentDetailResponse,
    IncidentStatusEventResponse,
    DuplicatePairing,
    OperatorSettingsSchema,
)

logger = logging.getLogger("sentinelgrid.operator.service")

# State transition matrix defined in Section 2.2.B of Backend Build Pack
ALLOWED_INCIDENT_TRANSITIONS: Dict[str, List[str]] = {
    "reported": ["under_review", "cancelled", "duplicate", "unverified"],
    "under_review": ["confirmed", "unverified", "cancelled", "duplicate"],
    "confirmed": ["assigned", "under_review", "cancelled"],
    "assigned": ["en_route", "confirmed", "cancelled"],
    "en_route": ["on_scene", "assigned"],
    "on_scene": ["resolved", "en_route"],
    "resolved": ["closed", "under_review"],
    "unverified": ["under_review", "closed"],
    "cancelled": [],   # Terminal
    "duplicate": [],   # Terminal
    "closed": [],      # Terminal
}

# Cached operator preferences
_operator_settings = OperatorSettingsSchema()

def get_operator_settings() -> OperatorSettingsSchema:
    return _operator_settings

def update_operator_settings(new_settings: OperatorSettingsSchema) -> OperatorSettingsSchema:
    global _operator_settings
    _operator_settings = new_settings
    return _operator_settings

def build_incident_response(incident: Incident) -> IncidentResponse:
    """Transform Incident entity to schema matching frontend contract."""
    lat, lng = extract_lat_lng(incident.location)

    from sqlalchemy.orm import attributes
    state = attributes.instance_state(incident)
    loaded_links = state.dict.get("report_links")
    report_ids = [str(link.report_id) for link in loaded_links] if loaded_links else []

    created_iso = incident.created_at.replace(tzinfo=timezone.utc).isoformat() if incident.created_at else datetime.now(timezone.utc).isoformat()
    updated_iso = incident.updated_at.replace(tzinfo=timezone.utc).isoformat() if incident.updated_at else created_iso

    return IncidentResponse(
        id=str(incident.id),
        publicCode=incident.public_code,
        public_code=incident.public_code,
        category=incident.category,
        urgency=incident.urgency,
        status=incident.status,
        title=incident.title,
        location={"lat": lat, "lng": lng, "source": "manual_map"},
        locationLabel=incident.location_label or "Campus Incident Location",
        location_label=incident.location_label or "Campus Incident Location",
        reportIds=report_ids,
        report_ids=report_ids,
        createdAt=created_iso,
        created_at=created_iso,
        updatedAt=updated_iso,
        updated_at=updated_iso,
        evidenceLabel=incident.evidence_label,
        evidence_label=incident.evidence_label,
        hidePreciseLocationFromPublic=incident.hide_precise_location,
        hide_precise_location=incident.hide_precise_location,
        synthetic=True,
    )

def build_incident_detail_response(incident: Incident) -> IncidentDetailResponse:
    """Build comprehensive workspace view for operator detail inspection."""
    incident_resp = build_incident_response(incident)

    from sqlalchemy.orm import attributes
    state = attributes.instance_state(incident)
    linked_reports = []
    loaded_links = state.dict.get("report_links")
    text_assessment = None
    vision_assessment = None
    duplicates_list = []

    if loaded_links:
        sorted_links = sorted(
            [l for l in loaded_links if getattr(l, "report", None) is not None],
            key=lambda l: l.report.created_at or datetime.min,
            reverse=True
        )
        for link in sorted_links:
            rep = link.report
            linked_reports.append(build_report_response(rep))
            rep_state = attributes.instance_state(rep)
            loaded_ass = rep_state.dict.get("ai_assessments")
            if loaded_ass:
                for ass in loaded_ass:
                    if ass.pipeline_type == "text_classifier" and isinstance(ass.raw_output, dict) and "suggestedCategory" in ass.raw_output and not text_assessment:
                        text_assessment = ass.raw_output
                    elif ass.pipeline_type == "vision_fire_smoke" and isinstance(ass.raw_output, dict) and "finding" in ass.raw_output and not vision_assessment:
                        vision_assessment = ass.raw_output
                    elif ass.pipeline_type == "duplicate_matching" and isinstance(ass.raw_output, dict) and not duplicates_list:
                        duplicates_list = ass.raw_output.get("candidates", [])


    timeline = []
    if incident.status_events:
        for ev in sorted(incident.status_events, key=lambda x: x.created_at):
            timeline.append(
                IncidentStatusEventResponse(
                    id=str(ev.id),
                    incidentId=str(ev.incident_id),
                    incident_id=str(ev.incident_id),
                    fromStatus=ev.from_status,
                    from_status=ev.from_status,
                    toStatus=ev.to_status,
                    to_status=ev.to_status,
                    at=ev.created_at.replace(tzinfo=timezone.utc).isoformat() if ev.created_at else datetime.now(timezone.utc).isoformat(),
                    actorRole=ev.actor_role,
                    actor_role=ev.actor_role,
                    note=ev.note,
                )
            )

    assignments_list = []
    if incident.assignments:
        for asg in incident.assignments:
            assignments_list.append({
                "id": str(asg.id),
                "incidentId": str(asg.incident_id),
                "responderId": str(asg.responder_id),
                "status": asg.status,
                "offeredAt": asg.offered_at.isoformat() if asg.offered_at else None,
                "acceptedAt": asg.accepted_at.isoformat() if asg.accepted_at else None,
                "completedAt": asg.completed_at.isoformat() if asg.completed_at else None,
                "etaMinutes": asg.eta_minutes,
                "distanceKm": asg.distance_km,
            })

    evidence_data = {
        "linkedReports": len(incident.report_links) if incident.report_links else 0,
        "temporalConsistency": "aligned",
        "locationConsistency": "aligned",
        "reusedMediaFlag": False,
        "corroboratingVisual": any(len(l.report.media_assets) > 0 for l in incident.report_links if l.report and l.report.media_assets),
        "missing": [],
        "conflicting": [],
        "duplicates": duplicates_list,
    }

    if text_assessment:
        evidence_data["text"] = text_assessment
    else:
        evidence_data["text"] = {
            "suggestedCategory": incident.category,
            "suggestedUrgency": incident.urgency,
            "modelScore": 0.85,
            "scoreMeaning": "Relative classifier score, not probability the incident is real.",
            "reviewRequired": False,
            "explanation": f"Incident categorized as {incident.category}.",
            "modelVersion": "distilbert-emergency-v1-mock",
        }
    if vision_assessment:
        evidence_data["vision"] = vision_assessment

    return IncidentDetailResponse(
        incident=incident_resp,
        linkedReports=linked_reports,
        linked_reports=linked_reports,
        evidence=evidence_data,
        assignments=assignments_list,
        timeline=timeline,
    )

# --- 150m Spatial Auto-Clustering ---

async def cluster_report_to_incident(
    db: AsyncSession,
    report: Report,
    radius_meters: float = 150.0,
    window_minutes: int = 30
) -> Incident:
    """
    Search active incidents within radius (default 150m) and time window (30 mins).
    Attaches report to existing incident or creates a new Incident with publicCode.
    """
    # Check if report is already attached
    link_check = await db.scalar(select(IncidentReport.incident_id).where(IncidentReport.report_id == report.id))
    if link_check:
        inc = await db.get(Incident, link_check)
        if inc:
            return inc

    r_lat, r_lng = extract_lat_lng(report.location)

    cutoff_time = datetime.utcnow() - timedelta(minutes=window_minutes)

    stmt = (
        select(Incident)
        .options(selectinload(Incident.report_links))
        .where(
            Incident.status.notin_(["resolved", "closed", "cancelled", "duplicate"]),
            Incident.created_at >= cutoff_time
        )
    )
    res = await db.execute(stmt)
    active_incidents = res.scalars().all()

    matched_incident = None
    for candidate in active_incidents:
        cand_lat, cand_lng = extract_lat_lng(candidate.location)

        dist_meters = haversine_distance_meters(r_lat, r_lng, cand_lat, cand_lng)
        if dist_meters <= radius_meters:
            matched_incident = candidate
            break

    if matched_incident:
        # Link to existing clustered incident
        link = IncidentReport(
            incident_id=matched_incident.id,
            report_id=report.id,
            link_reason=f"Spatial auto-clustering (within {radius_meters}m)"
        )
        db.add(link)
        matched_incident.updated_at = datetime.utcnow()
        await db.commit()
        load_stmt = (
            select(Incident)
            .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
            .where(Incident.id == matched_incident.id)
        )
        return (await db.execute(load_stmt)).scalar_one()

    # Create new Incident with generated publicCode
    if report.channel == "sos":
        code = f"SOS-{random.randint(10, 99)}"
    else:
        code = str(random.randint(100, 999))

    # Guarantee unique public_code
    check_code = await db.scalar(select(Incident.id).where(Incident.public_code == code))
    if check_code:
        code = f"{code}-{uuid.uuid4().hex[:2].upper()}"

    title = f"Incident {code} · {report.category.replace('_', ' ').title()}"
    new_incident = Incident(
        public_code=code,
        title=title,
        category=report.category,
        urgency=report.urgency,
        status="reported",
        evidence_label="unverified",
        location=report.location,
        location_label=report.location_label or "Campus Area",
        operator_notes=None,
    )
    db.add(new_incident)
    await db.flush()

    # Link report to new incident
    link = IncidentReport(
        incident_id=new_incident.id,
        report_id=report.id,
        link_reason="Primary incident origin report"
    )
    db.add(link)

    # Initial status event
    event = IncidentStatusEvent(
        incident_id=new_incident.id,
        from_status=None,
        to_status="reported",
        actor_role="system",
        note="Incident initiated via report ingestion"
    )
    db.add(event)
    await db.commit()

    # Re-query
    load_stmt = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == new_incident.id)
    )
    return (await db.execute(load_stmt)).scalar_one()

# --- State Machine Enforcement ---

async def advance_incident_state(
    db: AsyncSession,
    user: User,
    incident_id: str,
    to_status: str,
    reason: Optional[str] = None
) -> Incident:
    """
    Advance incident state machine.
    Strictly enforce the transition matrix from Section 2.2.B.
    Reject illegal jumps (e.g. resolved -> en_route, closed -> under_review) with HTTP 400.
    """
    try:
        inc_uuid = uuid.UUID(incident_id)
    except ValueError:
        raise NotFoundError("Invalid incident ID format")

    stmt = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == inc_uuid)
    )
    res = await db.execute(stmt)
    incident = res.scalar_one_or_none()

    if not incident:
        raise NotFoundError(f"Incident '{incident_id}' not found")

    allowed_next = ALLOWED_INCIDENT_TRANSITIONS.get(incident.status, [])
    if to_status not in allowed_next:
        raise AppException(
            code="ILLEGAL_STATE_TRANSITION",
            message=f"Illegal transition from '{incident.status}' to '{to_status}'. Allowed transitions: {allowed_next}",
            status_code=400,
        )

    from_status = incident.status
    incident.status = to_status
    incident.updated_at = datetime.utcnow()

    if to_status == "resolved":
        incident.resolved_at = datetime.utcnow()
    elif to_status == "confirmed":
        incident.evidence_label = "confirmed_by_operator"

    note_text = reason or f"State transitioned to {to_status} by operator {user.email}"
    status_event = IncidentStatusEvent(
        incident_id=incident.id,
        from_status=from_status,
        to_status=to_status,
        actor_id=user.id,
        actor_role=user.role,
        note=note_text,
    )
    db.add(status_event)

    # Immutable audit log
    audit = AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="UPDATE_INCIDENT_STATE",
        target_entity="Incident",
        target_id=str(incident.id),
        details={"from": from_status, "to": to_status, "reason": note_text},
    )
    db.add(audit)

    # Transactional outbox event
    await create_outbox_event(
        session=db,
        aggregate_type="Incident",
        aggregate_id=incident.id,
        event_type="incident.updated",
        payload={
            "incident_id": str(incident.id),
            "public_code": incident.public_code,
            "from_status": from_status,
            "to_status": to_status,
            "reason": note_text,
        }
    )
    await db.commit()
    refetch = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == incident.id)
    )
    return (await db.execute(refetch)).scalar_one()

# --- Merge & Split Actions ---

async def merge_reports_action(
    db: AsyncSession,
    user: User,
    target_incident_id: str,
    report_ids: List[str],
    reason: str
) -> Incident:
    """
    Merge multiple reports into one incident with mandatory reason.
    Retains all evidence and writes immutable audit log.
    """
    try:
        target_uuid = uuid.UUID(target_incident_id)
    except ValueError:
        raise NotFoundError("Invalid target incident ID")

    stmt = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == target_uuid)
    )
    res = await db.execute(stmt)
    target_incident = res.scalar_one_or_none()

    if not target_incident:
        raise NotFoundError("Target incident not found")

    linked_count = 0
    for rep_id_str in report_ids:
        try:
            rep_uuid = uuid.UUID(rep_id_str)
        except ValueError:
            continue

        # Check if report exists
        rep_check = await db.get(Report, rep_uuid)
        if not rep_check:
            continue

        # Remove previous links to other incidents
        del_stmt = select(IncidentReport).where(IncidentReport.report_id == rep_uuid)
        existing_links = (await db.execute(del_stmt)).scalars().all()
        for link in existing_links:
            await db.delete(link)

        # Create link to target incident
        new_link = IncidentReport(
            incident=target_incident,
            incident_id=target_incident.id,
            report_id=rep_uuid,
            linked_by_user_id=user.id,
            link_reason=f"Merged by {user.email}: {reason}",
        )
        db.add(new_link)
        if new_link not in target_incident.report_links:
            target_incident.report_links.append(new_link)
        linked_count += 1

    target_incident.updated_at = datetime.utcnow()

    # Immutable audit trail
    audit = AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="MERGE_REPORTS",
        target_entity="Incident",
        target_id=str(target_incident.id),
        details={"target_incident": target_incident.public_code, "report_ids": report_ids, "reason": reason},
    )
    db.add(audit)

    await create_outbox_event(
        session=db,
        aggregate_type="Incident",
        aggregate_id=target_incident.id,
        event_type="incident.merged",
        payload={
            "incident_id": str(target_incident.id),
            "merged_reports_count": linked_count,
            "reason": reason,
        }
    )
    await db.commit()
    return target_incident

async def split_report_action(
    db: AsyncSession,
    user: User,
    report_id: str,
    reason: str
) -> Incident:
    """
    Detach an incorrectly grouped report into a separate incident with audit log.
    """
    try:
        rep_uuid = uuid.UUID(report_id)
    except ValueError:
        raise NotFoundError("Invalid report ID")

    rep_stmt = select(Report).where(Report.id == rep_uuid)
    report = (await db.execute(rep_stmt)).scalar_one_or_none()

    if not report:
        raise NotFoundError("Report not found")

    # Remove old incident link
    del_stmt = select(IncidentReport).where(IncidentReport.report_id == rep_uuid)
    old_links = (await db.execute(del_stmt)).scalars().all()
    old_inc_id = str(old_links[0].incident_id) if old_links else None
    for link in old_links:
        await db.delete(link)

    # Create new Incident
    code = f"SPL-{random.randint(10, 99)}"
    check_code = await db.scalar(select(Incident.id).where(Incident.public_code == code))
    if check_code:
        code = f"SPL-{uuid.uuid4().hex[:4].upper()}"

    title = f"Incident {code} · {report.category.replace('_', ' ').title()}"
    new_inc = Incident(
        public_code=code,
        title=title,
        category=report.category,
        urgency=report.urgency,
        status="reported",
        evidence_label="unverified",
        location=report.location,
        location_label=report.location_label or "Split Location",
        operator_notes=f"Split from incident {old_inc_id} by {user.email}: {reason}",
    )
    db.add(new_inc)
    await db.flush()

    new_link = IncidentReport(
        incident_id=new_inc.id,
        report_id=report.id,
        linked_by_user_id=user.id,
        link_reason=f"Split by {user.email}: {reason}",
    )
    db.add(new_link)

    # Status event for new incident
    event = IncidentStatusEvent(
        incident_id=new_inc.id,
        from_status=None,
        to_status="reported",
        actor_id=user.id,
        actor_role=user.role,
        note=f"Split from prior incident: {reason}"
    )
    db.add(event)

    # Immutable audit log
    audit = AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="SPLIT_REPORT",
        target_entity="Report",
        target_id=str(report.id),
        details={"old_incident_id": old_inc_id, "new_incident_id": str(new_inc.id), "reason": reason},
    )
    db.add(audit)

    await create_outbox_event(
        session=db,
        aggregate_type="Incident",
        aggregate_id=new_inc.id,
        event_type="incident.split",
        payload={
            "old_incident_id": old_inc_id,
            "new_incident_id": str(new_inc.id),
            "report_id": str(report.id),
            "reason": reason,
        }
    )
    await db.commit()

    refetch = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == new_inc.id)
    )
    return (await db.execute(refetch)).scalar_one()

async def override_ai_assessment_action(
    db: AsyncSession,
    user: User,
    incident_id: str,
    category: Optional[str],
    urgency: Optional[str],
    reason: str
) -> Incident:
    """Override AI classification with human operator authority."""
    try:
        inc_uuid = uuid.UUID(incident_id)
    except ValueError:
        raise NotFoundError("Invalid incident ID")

    stmt = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == inc_uuid)
    )
    incident = (await db.execute(stmt)).scalar_one_or_none()
    if not incident:
        raise NotFoundError("Incident not found")

    old_cat = incident.category
    old_urg = incident.urgency

    if category:
        incident.category = category
    if urgency:
        incident.urgency = urgency

    incident.evidence_label = "confirmed_by_operator"
    incident.updated_at = datetime.utcnow()

    audit = AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="OVERRIDE_AI",
        target_entity="Incident",
        target_id=str(incident.id),
        details={
            "old_category": old_cat,
            "new_category": incident.category,
            "old_urgency": old_urg,
            "new_urgency": incident.urgency,
            "reason": reason,
        },
    )
    db.add(audit)
    await db.commit()
    refetch = (
        select(Incident)
        .options(selectinload(Incident.report_links), selectinload(Incident.status_events))
        .where(Incident.id == incident.id)
    )
    return (await db.execute(refetch)).scalar_one()

# --- Queues & Roster ---

async def get_report_triage_queue(db: AsyncSession) -> List[Any]:
    """Return unreviewed reports waiting for human triage."""
    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.processing_state.in_(["received", "queued_for_ai"]))
        .order_by(Report.created_at.desc())
    )
    res = await db.execute(stmt)
    reports = res.scalars().all()
    return [build_report_response(r) for r in reports]

async def get_active_incidents_list(
    db: AsyncSession,
    status_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
    urgency_filter: Optional[str] = None,
) -> List[IncidentResponse]:
    """
    Return active incidents sorted by urgency priority
    (critical > high > medium > low), then created_at DESC.
    """
    urgency_order = case(
        (Incident.urgency == "critical", 1),
        (Incident.urgency == "high", 2),
        (Incident.urgency == "medium", 3),
        (Incident.urgency == "low", 4),
        else_=5
    )

    query = select(Incident).options(selectinload(Incident.report_links))

    if status_filter:
        query = query.where(Incident.status == status_filter)
    else:
        query = query.where(Incident.status.notin_(["closed", "duplicate", "cancelled"]))

    if category_filter:
        query = query.where(Incident.category == category_filter)

    if urgency_filter:
        query = query.where(Incident.urgency == urgency_filter)

    query = query.order_by(urgency_order, Incident.created_at.desc())
    res = await db.execute(query)
    incidents = res.scalars().all()
    return [build_incident_response(inc) for inc in incidents]

async def get_incident_detail(db: AsyncSession, incident_id: str) -> IncidentDetailResponse:
    try:
        inc_uuid = uuid.UUID(incident_id)
        stmt = (
            select(Incident)
            .options(
                selectinload(Incident.report_links).selectinload(IncidentReport.report).selectinload(Report.media_assets),
                selectinload(Incident.report_links).selectinload(IncidentReport.report).selectinload(Report.ai_assessments),
                selectinload(Incident.assignments),
                selectinload(Incident.status_events),
            )
            .where(Incident.id == inc_uuid)
        )
    except ValueError:
        # Search by publicCode if not UUID
        stmt = (
            select(Incident)
            .options(
                selectinload(Incident.report_links).selectinload(IncidentReport.report).selectinload(Report.media_assets),
                selectinload(Incident.report_links).selectinload(IncidentReport.report).selectinload(Report.ai_assessments),
                selectinload(Incident.assignments),
                selectinload(Incident.status_events),
            )
            .where(Incident.public_code == incident_id)
        )

    res = await db.execute(stmt)
    incident = res.scalar_one_or_none()

    if not incident:
        raise NotFoundError(f"Incident '{incident_id}' not found")

    return build_incident_detail_response(incident)

async def get_responders_roster(db: AsyncSession) -> List[Dict[str, Any]]:
    """Return available and on-duty field responders with telemetry coordinates."""
    stmt = (
        select(ResponderProfile)
        .options(selectinload(ResponderProfile.user))
        .where(ResponderProfile.is_approved == True)
        .order_by(ResponderProfile.is_on_duty.desc(), ResponderProfile.unit_code.asc())
    )
    res = await db.execute(stmt)
    profiles = res.scalars().all()

    roster = []
    for p in profiles:
        loc = None
        if p.last_known_location is not None:
            pt_lat, pt_lng = extract_lat_lng(p.last_known_location)
            loc = {"lat": pt_lat, "lng": pt_lng, "source": "gps"}

        roster.append({
            "id": str(p.id),
            "unitCode": p.unit_code,
            "unit_code": p.unit_code,
            "displayName": p.display_name or (p.user.full_name if p.user else p.unit_code),
            "display_name": p.display_name or (p.user.full_name if p.user else p.unit_code),
            "responderType": p.responder_type,
            "responder_type": p.responder_type,
            "capabilities": p.capabilities or [],
            "isOnDuty": p.is_on_duty,
            "is_on_duty": p.is_on_duty,
            "availabilityStatus": p.availability_status,
            "availability_status": p.availability_status,
            "location": loc,
            "isApproved": p.is_approved,
            "is_approved": p.is_approved,
        })
    return roster

async def get_suspected_duplicates(db: AsyncSession) -> List[DuplicatePairing]:
    """Find active incident pairs within 300m for candidate merge recommendations."""
    stmt = (
        select(Incident)
        .where(Incident.status.notin_(["closed", "duplicate", "cancelled"]))
        .order_by(Incident.created_at.desc())
        .limit(30)
    )
    incidents = (await db.execute(stmt)).scalars().all()

    pairings = []
    for i in range(len(incidents)):
        for j in range(i + 1, len(incidents)):
            inc_a = incidents[i]
            inc_b = incidents[j]

            lat_a, lng_a = extract_lat_lng(inc_a.location)
            lat_b, lng_b = extract_lat_lng(inc_b.location)

            dist_m = haversine_distance_meters(lat_a, lng_a, lat_b, lng_b)
            if dist_m <= 300.0:
                signals = [f"Spatial proximity ({int(dist_m)}m apart)"]
                if inc_a.category == inc_b.category:
                    signals.append(f"Matching category: {inc_a.category}")
                    rec = "likely_related" if dist_m <= 150.0 else "review"
                    score = round(max(0.6, 1.0 - (dist_m / 400.0)), 2)
                else:
                    signals.append(f"Different categories ({inc_a.category} vs {inc_b.category})")
                    rec = "weak"
                    score = 0.5

                pairings.append(
                    DuplicatePairing(
                        incidentIdA=inc_a.public_code,
                        incidentIdB=inc_b.public_code,
                        incident_id_a=inc_a.public_code,
                        incident_id_b=inc_b.public_code,
                        score=score,
                        signals=signals,
                        recommendation=rec,
                    )
                )

    return pairings

# --- Dispatch Recommendations & Operator Dispatch ---

async def get_dispatch_recommendations(
    db: AsyncSession,
    incident_id: str
) -> List[Any]:
    """
    Rank available approved responders by matching capabilities and distance to incident.
    """
    from app.modules.responder.schemas import DispatchRecommendation

    try:
        inc_uuid = uuid.UUID(incident_id)
        stmt = select(Incident).where(Incident.id == inc_uuid)
    except ValueError:
        stmt = select(Incident).where(Incident.public_code == incident_id)

    incident = (await db.execute(stmt)).scalar_one_or_none()
    if not incident:
        raise NotFoundError(f"Incident '{incident_id}' not found")

    inc_lat, inc_lng = extract_lat_lng(incident.location)

    CATEGORY_CAPABILITIES = {
        "fire_smoke": ["firefighting", "rescue", "hazard"],
        "medical": ["first_aid", "medical"],
        "road_accident": ["first_aid", "rescue", "security_patrol"],
        "personal_safety": ["security_patrol", "rescue"],
        "water_flood": ["rescue", "hazard"],
    }
    preferred_caps = set(CATEGORY_CAPABILITIES.get(incident.category, ["first_aid", "security_patrol"]))

    resp_stmt = (
        select(ResponderProfile)
        .options(selectinload(ResponderProfile.user))
        .where(
            ResponderProfile.is_approved == True,
            ResponderProfile.is_on_duty == True,
        )
    )
    profiles = (await db.execute(resp_stmt)).scalars().all()

    recommendations: List[DispatchRecommendation] = []
    for p in profiles:
        p_lat, p_lng = extract_lat_lng(p.last_known_location) if p.last_known_location else (inc_lat, inc_lng)
        dist_km, eta_min = calculate_route(p_lat, p_lng, inc_lat, inc_lng)

        unit_caps = set(p.capabilities or [])
        matched = unit_caps.intersection(preferred_caps)

        score = max(0.5, 1.0 - (dist_km / 5.0))
        if matched:
            score += 0.25 * len(matched)
            match_reason = f"Equipped for {incident.category.replace('_', ' ')}: {', '.join(matched)}"
        else:
            match_reason = "Nearby active unit"

        if p.availability_status == "busy":
            score -= 0.3
            match_reason += " (Currently on mission)"

        recommendations.append(
            DispatchRecommendation(
                responderId=str(p.id),
                unitCode=p.unit_code,
                displayName=p.display_name or (p.user.full_name if p.user else p.unit_code),
                responderType=p.responder_type,
                capabilities=p.capabilities or [],
                distanceKm=dist_km,
                etaMinutes=eta_min,
                score=round(score, 2),
                matchReason=match_reason,
            )
        )

    recommendations.sort(key=lambda r: (-r.score, r.etaMinutes))
    return recommendations

async def dispatch_responder_offer(
    db: AsyncSession,
    user: User,
    incident_id: str,
    responder_id: str,
    note: Optional[str] = None
) -> Assignment:
    """
    Operator issues a formal dispatch offer to a responder unit with a 90-second deadline.
    Strictly enforces Human-in-the-Loop: background/automated code cannot dispatch (HTTP 403).
    """
    if user.role not in ["operator", "admin"]:
        raise ForbiddenError("Automated background dispatch prohibited. Only authenticated operators can dispatch responders.")

    try:
        inc_uuid = uuid.UUID(incident_id)
        inc_stmt = select(Incident).options(selectinload(Incident.assignments)).where(Incident.id == inc_uuid)
    except ValueError:
        inc_stmt = select(Incident).options(selectinload(Incident.assignments)).where(Incident.public_code == incident_id)

    incident = (await db.execute(inc_stmt)).scalar_one_or_none()
    if not incident:
        raise NotFoundError("Incident not found")

    try:
        resp_uuid = uuid.UUID(responder_id)
        resp_stmt = select(ResponderProfile).where(ResponderProfile.id == resp_uuid)
    except ValueError:
        resp_stmt = select(ResponderProfile).where(ResponderProfile.unit_code == responder_id)

    responder = (await db.execute(resp_stmt)).scalar_one_or_none()
    if not responder:
        raise NotFoundError("Responder unit not found")

    if not responder.is_approved:
        raise AppException(400, "RESPONDER_NOT_APPROVED", f"Unit {responder.unit_code} has not been approved by an administrator")

    inc_lat, inc_lng = extract_lat_lng(incident.location)
    p_lat, p_lng = extract_lat_lng(responder.last_known_location) if responder.last_known_location else (inc_lat, inc_lng)
    dist_km, eta_min = calculate_route(p_lat, p_lng, inc_lat, inc_lng)

    now = datetime.utcnow()
    deadline = now + timedelta(seconds=90) # 90-second response window

    assignment = Assignment(
        incident_id=incident.id,
        responder_id=responder.id,
        status="offered",
        offered_at=now,
        offer_deadline=deadline,
        eta_minutes=eta_min,
        distance_km=dist_km,
        route_note=note,
    )
    db.add(assignment)
    await db.flush()

    if incident.status in ["reported", "under_review", "confirmed"]:
        prev_status = incident.status
        incident.status = "assigned"
        db.add(IncidentStatusEvent(
            incident_id=incident.id,
            from_status=prev_status,
            to_status="assigned",
            actor_id=user.id,
            actor_role=user.role,
            note=f"Dispatch offer sent to {responder.unit_code} by {user.email}"
        ))

    db.add(AssignmentEvent(
        assignment_id=assignment.id,
        from_status=None,
        to_status="offered",
        triggered_by_user_id=user.id,
        note=f"Dispatch offer issued by operator {user.email}"
    ))

    db.add(AuditLog(
        user_id=user.id,
        actor_email=user.email,
        action="DISPATCH_OFFER",
        target_entity="Assignment",
        target_id=str(assignment.id),
        details={
            "incident_id": str(incident.id),
            "incident_code": incident.public_code,
            "responder_id": str(responder.id),
            "unit_code": responder.unit_code,
            "deadline": deadline.isoformat(),
        }
    ))

    await create_outbox_event(
        session=db,
        aggregate_type="Assignment",
        aggregate_id=assignment.id,
        event_type="assignment.offered",
        payload={
            "assignment_id": str(assignment.id),
            "incident_id": str(incident.id),
            "responder_id": str(responder.id),
            "unit_code": responder.unit_code,
            "deadline": deadline.isoformat(),
            "eta_minutes": eta_min,
            "distance_km": dist_km,
        }
    )

    responder.availability_status = "busy"
    await db.commit()

    load_stmt = (
        select(Assignment)
        .options(selectinload(Assignment.incident), selectinload(Assignment.events))
        .where(Assignment.id == assignment.id)
    )
    return (await db.execute(load_stmt)).scalar_one()
