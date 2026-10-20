import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from shapely.geometry import Point
from geoalchemy2.shape import from_shape, to_shape

from app.core.exceptions import AppException, NotFoundError, ForbiddenError
from app.core.outbox import create_outbox_event
from app.common.spatial import haversine_distance, coarsen_coordinates
from app.models.entities import Report, Incident, IncidentReport, MediaAsset, TrustedContact, User
from app.modules.media.schemas import MediaAssetResponse
from app.modules.media.service import get_media_url
from app.modules.citizen.schemas import (
    SOSRequest,
    ReportCreateRequest,
    ReportResponse,
    TrustedContactCreate,
    TrustedContactResponse,
    NearbyAlertResponse,
)

logger = logging.getLogger("sentinelgrid.citizen.service")

def build_report_response(report: Report) -> ReportResponse:
    """Transform Report entity to schema matching frontend contract."""
    point = to_shape(report.location)
    lng = float(point.x)
    lat = float(point.y)

    from sqlalchemy.orm import attributes
    state = attributes.instance_state(report)

    media_items = []
    loaded_media = state.dict.get("media_assets")
    if loaded_media:
        for m in loaded_media:
            media_items.append(
                MediaAssetResponse(
                    id=str(m.id),
                    kind=m.file_type,
                    fileName=m.file_name or "evidence",
                    file_name=m.file_name or "evidence",
                    mimeType=m.mime_type or "application/octet-stream",
                    mime_type=m.mime_type or "application/octet-stream",
                    sizeBytes=m.file_size_bytes or 0,
                    size_bytes=m.file_size_bytes or 0,
                    url=None, # Loaded on-demand
                )
            )

    incident_id = None
    loaded_links = state.dict.get("incident_links")
    if loaded_links:
        incident_id = str(loaded_links[0].incident_id)

    created_iso = report.created_at.replace(tzinfo=timezone.utc).isoformat() if report.created_at else datetime.now(timezone.utc).isoformat()

    return ReportResponse(
        id=str(report.id),
        reporterId=str(report.reporter_id) if report.reporter_id else "anonymous",
        reporter_id=str(report.reporter_id) if report.reporter_id else "anonymous",
        createdAt=created_iso,
        created_at=created_iso,
        channel=report.channel,
        category=report.category,
        urgency=report.urgency,
        text=report.raw_text or "",
        location={
            "lat": lat,
            "lng": lng,
            "source": "gps" if report.channel == "sos" else "manual_map",
        },
        locationLabel=report.location_label or "Coordinates Broadcasted",
        location_label=report.location_label or "Coordinates Broadcasted",
        media=media_items,
        processingState=report.processing_state,
        processing_state=report.processing_state,
        deliveryState=report.delivery_state,
        delivery_state=report.delivery_state,
        incidentId=incident_id,
        incident_id=incident_id,
        cancelledReason=report.cancelled_reason,
        cancelled_reason=report.cancelled_reason,
        synthetic=True,
    )

async def create_sos_beacon(
    db: AsyncSession,
    user: User,
    payload: SOSRequest
) -> Tuple[ReportResponse, bool]:
    """
    Sub-second emergency SOS ingestion.
    Saves report and writes OUTBOX_SOS_CREATED in a single atomic transaction.
    Guarantees idempotency deduplication.
    """
    if payload.idempotency_key:
        stmt = (
            select(Report)
            .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
            .where(Report.idempotency_key == payload.idempotency_key)
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            return build_report_response(existing), False

    geom = from_shape(Point(payload.location.lng, payload.location.lat), srid=4326)
    report = Report(
        reporter_id=user.id,
        channel="sos",
        category="personal_safety",
        urgency="critical",
        raw_text=payload.note or "CRITICAL PERSONAL SOS",
        location=geom,
        location_label=payload.location_label or "Main Quadrangle · Coordinates Broadcasted",
        status="submitted",
        processing_state="received",
        delivery_state="received_by_server",
        idempotency_key=payload.idempotency_key,
    )
    db.add(report)
    await db.flush()

    # Spatial auto-clustering into existing incident or spawn new incident
    from app.modules.operator.service import cluster_report_to_incident
    clustered_inc = await cluster_report_to_incident(db, report)

    # Outbox event for sub-second asynchronous notification
    await create_outbox_event(
        session=db,
        aggregate_type="Report",
        aggregate_id=report.id,
        event_type="OUTBOX_SOS_CREATED",
        payload={
            "report_id": str(report.id),
            "reporter_id": str(user.id),
            "incident_id": str(clustered_inc.id),
            "lat": payload.location.lat,
            "lng": payload.location.lng,
            "urgency": "critical",
            "category": "personal_safety",
            "channel": "sos",
            "created_at": report.created_at.isoformat() if report.created_at else datetime.utcnow().isoformat(),
        }
    )
    await db.commit()

    # Reload with relationships
    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.id == report.id)
    )
    reloaded = (await db.execute(stmt)).scalar_one()
    return build_report_response(reloaded), True

async def create_citizen_report(
    db: AsyncSession,
    user: User,
    payload: ReportCreateRequest
) -> Tuple[ReportResponse, bool]:
    """
    Ingest structured report with category, location, and optional media attachments.
    Enforces idempotency deduplication and outbox event creation.
    """
    if payload.idempotency_key:
        stmt = (
            select(Report)
            .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
            .where(Report.idempotency_key == payload.idempotency_key)
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            return build_report_response(existing), False

    geom = from_shape(Point(payload.location.lng, payload.location.lat), srid=4326)
    report = Report(
        reporter_id=user.id,
        channel=payload.channel or "form",
        category=payload.category,
        urgency=payload.urgency or "high",
        raw_text=payload.text,
        location=geom,
        location_label=payload.location_label or "Campus Location",
        status="submitted",
        processing_state="received",
        delivery_state="received_by_server",
        idempotency_key=payload.idempotency_key,
    )
    db.add(report)
    await db.flush()

    # Associate uploaded media assets if provided
    if payload.media_asset_ids:
        for media_id_str in payload.media_asset_ids:
            try:
                media_uuid = uuid.UUID(media_id_str)
                m_stmt = select(MediaAsset).where(MediaAsset.id == media_uuid)
                m_res = await db.execute(m_stmt)
                asset = m_res.scalar_one_or_none()
                if asset:
                    asset.report_id = report.id
            except ValueError:
                pass

    # Spatial auto-clustering into existing incident or spawn new incident
    from app.modules.operator.service import cluster_report_to_incident
    clustered_inc = await cluster_report_to_incident(db, report)

    # Transactional outbox event
    await create_outbox_event(
        session=db,
        aggregate_type="Report",
        aggregate_id=report.id,
        event_type="report.created",
        payload={
            "report_id": str(report.id),
            "reporter_id": str(user.id),
            "incident_id": str(clustered_inc.id),
            "category": payload.category,
            "channel": report.channel,
            "urgency": report.urgency,
            "lat": payload.location.lat,
            "lng": payload.location.lng,
        }
    )
    await db.commit()

    # Reload with relationships
    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.id == report.id)
    )
    reloaded = (await db.execute(stmt)).scalar_one()
    return build_report_response(reloaded), True

async def list_citizen_reports(db: AsyncSession, user: User) -> List[ReportResponse]:
    """List reports strictly authored by the authenticated citizen (Server-side RBAC)."""
    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.reporter_id == user.id)
        .order_by(Report.created_at.desc())
    )
    res = await db.execute(stmt)
    reports = res.scalars().all()
    return [build_report_response(r) for r in reports]

async def get_citizen_report(db: AsyncSession, user: User, report_id: str) -> ReportResponse:
    """Fetch report receipt ensuring caller owns the report."""
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        raise NotFoundError("Invalid report ID")

    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.id == report_uuid)
    )
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()

    if not report:
        raise NotFoundError("Report not found")

    if report.reporter_id != user.id:
        raise ForbiddenError("Access denied: You are not authorized to view this report")

    return build_report_response(report)

async def cancel_citizen_report(
    db: AsyncSession,
    user: User,
    report_id: str,
    reason: str
) -> ReportResponse:
    """
    Cancel a report. Allowed only if caller is owner and incident has not yet been dispatched/confirmed.
    """
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        raise NotFoundError("Invalid report ID")

    stmt = (
        select(Report)
        .options(
            selectinload(Report.media_assets),
            selectinload(Report.incident_links).selectinload(IncidentReport.incident)
        )
        .where(Report.id == report_uuid)
    )
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()

    if not report:
        raise NotFoundError("Report not found")

    if report.reporter_id != user.id:
        raise ForbiddenError("Access denied: You can only cancel your own reports")

    # Check dispatch status across linked incidents
    if report.incident_links:
        for link in report.incident_links:
            inc = link.incident
            if inc and inc.status not in ["reported", "under_review", "unverified"]:
                raise AppException(
                    code="CANNOT_CANCEL_DISPATCHED_INCIDENT",
                    message=f"Incident '{inc.public_code}' is in state '{inc.status}'. Dispatched or confirmed incidents cannot be cancelled.",
                    status_code=400,
                )

    report.status = "cancelled"
    report.processing_state = "cancelled"
    report.cancelled_reason = reason

    await create_outbox_event(
        session=db,
        aggregate_type="Report",
        aggregate_id=report.id,
        event_type="report.cancelled",
        payload={
            "report_id": str(report.id),
            "reason": reason,
            "cancelled_at": datetime.utcnow().isoformat(),
        }
    )
    await db.commit()
    await db.refresh(report)

    # Re-query
    stmt = (
        select(Report)
        .options(selectinload(Report.media_assets), selectinload(Report.incident_links))
        .where(Report.id == report.id)
    )
    reloaded = (await db.execute(stmt)).scalar_one()
    return build_report_response(reloaded)

# --- Trusted Contacts ---

async def get_user_contacts(db: AsyncSession, user_id: uuid.UUID) -> List[TrustedContactResponse]:
    stmt = select(TrustedContact).where(TrustedContact.user_id == user_id, TrustedContact.is_active == True)
    res = await db.execute(stmt)
    contacts = res.scalars().all()
    return [
        TrustedContactResponse(
            id=str(c.id),
            user_id=str(c.user_id),
            name=c.name,
            phone=c.phone,
            relationship_label=c.relationship_label,
            relationshipLabel=c.relationship_label,
            is_active=c.is_active,
        )
        for c in contacts
    ]

async def add_user_contact(
    db: AsyncSession,
    user_id: uuid.UUID,
    payload: TrustedContactCreate
) -> TrustedContactResponse:
    count_stmt = select(func.count()).select_from(TrustedContact).where(
        TrustedContact.user_id == user_id,
        TrustedContact.is_active == True
    )
    count = await db.scalar(count_stmt)

    if count and count >= 3:
        raise AppException(
            code="MAX_CONTACTS_REACHED",
            message="Maximum of 3 trusted contacts reached. Remove an existing contact before adding a new one.",
            status_code=400,
        )

    contact = TrustedContact(
        user_id=user_id,
        name=payload.name,
        phone=payload.phone,
        relationship_label=payload.relationship_label,
        is_active=True,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)

    return TrustedContactResponse(
        id=str(contact.id),
        user_id=str(contact.user_id),
        name=contact.name,
        phone=contact.phone,
        relationship_label=contact.relationship_label,
        relationshipLabel=contact.relationship_label,
        is_active=contact.is_active,
    )

async def delete_user_contact(db: AsyncSession, user_id: uuid.UUID, contact_id: str) -> dict:
    try:
        c_uuid = uuid.UUID(contact_id)
    except ValueError:
        raise NotFoundError("Invalid contact ID")

    stmt = select(TrustedContact).where(TrustedContact.id == c_uuid, TrustedContact.user_id == user_id)
    res = await db.execute(stmt)
    contact = res.scalar_one_or_none()

    if not contact:
        raise NotFoundError("Trusted contact not found")

    await db.delete(contact)
    await db.commit()
    return {"ok": True, "message": "Trusted contact removed successfully"}

# --- Public Nearby Alerts (Privacy Coarsening) ---

async def get_nearby_alerts(
    db: AsyncSession,
    lat: float,
    lng: float,
    radius_km: float = 5.0
) -> List[NearbyAlertResponse]:
    """
    Fetch active incidents within radius.
    Enforces privacy by design: coordinates are coarsened (~100m grid)
    to protect reporter/victim location privacy.
    """
    stmt = (
        select(Incident)
        .where(Incident.status.notin_(["resolved", "closed", "cancelled"]))
        .order_by(Incident.created_at.desc())
    )
    res = await db.execute(stmt)
    incidents = res.scalars().all()

    alerts = []
    for inc in incidents:
        point = to_shape(inc.location)
        inc_lat = float(point.y)
        inc_lng = float(point.x)

        distance_km = haversine_distance(lat, lng, inc_lat, inc_lng)
        if distance_km <= radius_km:
            coarsened = coarsen_coordinates(inc_lat, inc_lng, grid_size=0.001)
            coarsened_lat, coarsened_lng = coarsened.lat, coarsened.lng
            dist_label = f"{int(distance_km * 1000)}m away" if distance_km < 1.0 else f"{distance_km:.1f}km away"

            status_map = {
                "reported": "Incident Reported",
                "under_review": "Under Operator Review",
                "confirmed": "Verified Incident",
                "assigned": "Responders Assigned",
                "en_route": "Responders En Route",
                "on_scene": "Responders On Scene",
            }
            status_label = status_map.get(inc.status, "Active Emergency")

            tone = "active" if inc.urgency in ["critical", "high"] else "warning"

            alerts.append(
                NearbyAlertResponse(
                    id=f"alt_{inc.public_code}",
                    category=inc.category,
                    title=f"{inc.title} · {inc.location_label or 'Campus Area'}",
                    distanceLabel=dist_label,
                    distance_label=dist_label,
                    statusLabel=status_label,
                    status_label=status_label,
                    tone=tone,
                    coarsened=True,
                    location={"lat": coarsened_lat, "lng": coarsened_lng},
                )
            )

    return alerts
