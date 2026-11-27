from typing import List, Dict, Any
from datetime import datetime, timedelta
import math
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.incident import Incident
from app.models.report import Report
from app.models.responder import ResponderProfile
from app.models.assignment import Assignment
from app.common.spatial import extract_lat_lng
from app.modules.admin.service import get_drill_mode_state
from app.modules.analytics.schemas import (
    AnalyticsSummary,
    HotspotFeatureCollection,
    HotspotFeature,
    HotspotGeometry,
    HotspotProperties,
    CategoryBreakdown,
    CategoryCount,
    ResponseTimeStats,
    ResponseMilestone,
    TimelinePoint,
)

CATEGORY_NAMES = {
    "fire_smoke": "Fire & Smoke",
    "road_accident": "Road Accident",
    "medical": "Medical",
    "personal_safety": "Personal Safety / SOS",
    "water_flood": "Flood / Water",
    "hazard": "Hazard",
    "other": "Other",
}

async def get_analytics_summary(session: AsyncSession) -> AnalyticsSummary:
    """Calculate drill and operational KPI metrics across platform data."""
    # 1. Total incidents
    total_incidents = (await session.execute(select(func.count(Incident.id)))).scalar() or 0

    # 2. Active incidents (match all open IncidentStatus enum values)
    active_incidents = (
        await session.execute(
            select(func.count(Incident.id)).where(
                Incident.status.in_(["reported", "under_review", "confirmed", "assigned", "en_route", "on_scene"])
            )
        )
    ).scalar() or 0

    # 3. Resolved incidents
    resolved_incidents = (
        await session.execute(
            select(func.count(Incident.id)).where(Incident.status.in_(["resolved", "closed"]))
        )
    ).scalar() or 0

    # 4. Open reports count
    open_reports_count = (
        await session.execute(
            select(func.count(Report.id)).where(Report.processing_state != "archived")
        )
    ).scalar() or 0

    # 5. Active responders count
    active_responders_count = (
        await session.execute(
            select(func.count(ResponderProfile.id)).where(
                ResponderProfile.is_on_duty == True,
                ResponderProfile.is_approved == True,
            )
        )
    ).scalar() or 0

    # 6. False alarms rate
    false_alarm_count = (
        await session.execute(
            select(func.count(Incident.id)).where(Incident.status.in_(["unverified", "cancelled"]))
        )
    ).scalar() or 0
    false_alarm_rate = (
        round((false_alarm_count / total_incidents) * 100, 1) if total_incidents > 0 else 0.0
    )

    # 7. Response times (use real Assignment durations when available)
    stmt = select(Assignment).where(
        Assignment.status.in_(["arrived", "completed"]),
        Assignment.completed_at.isnot(None),
    )
    result = await session.execute(stmt)
    completed_assignments = result.scalars().all()

    if completed_assignments:
        durations = [
            (a.completed_at - a.offered_at).total_seconds()
            for a in completed_assignments
            if a.completed_at and a.offered_at and (a.completed_at > a.offered_at)
        ]
        valid_durations = [d for d in durations if d >= 1.0]
        avg_seconds = sum(valid_durations) / len(valid_durations) if valid_durations else 210.0
    else:
        avg_seconds = 210.0 # Baseline when no completed assignments exist yet

    avg_minutes = round(avg_seconds / 60.0, 1)

    # 8. Drill mode check (Redis with Postgres AuditLog fallback)
    is_drill = await get_drill_mode_state(session)

    return AnalyticsSummary(
        total_incidents=total_incidents,
        active_incidents=active_incidents,
        resolved_incidents=resolved_incidents,
        open_reports_count=open_reports_count,
        active_responders_count=active_responders_count,
        avg_arrival_time_minutes=avg_minutes,
        avg_response_time_seconds=round(avg_seconds, 1),
        false_alarm_rate=false_alarm_rate,
        synthetic_drill_mode=is_drill,
    )

async def get_incident_hotspots(session: AsyncSession) -> HotspotFeatureCollection:
    """Return geospatial incident cluster density as GeoJSON FeatureCollection."""
    stmt = select(Incident).where(Incident.location.isnot(None))
    result = await session.execute(stmt)
    incidents = result.scalars().all()

    features = []
    weight_map = {
        "critical": 3.0,
        "high": 2.0,
        "medium": 1.5,
        "low": 1.0,
    }

    for inc in incidents:
        lat, lng = extract_lat_lng(inc.location)
        if lat == 0.0 and lng == 0.0:
            continue

        weight = weight_map.get(inc.urgency.lower() if inc.urgency else "medium", 1.5)
        features.append(
            HotspotFeature(
                type="Feature",
                geometry=HotspotGeometry(
                    type="Point",
                    coordinates=[lng, lat],
                ),
                properties=HotspotProperties(
                    incident_id=str(inc.id),
                    title=inc.title or "Emergency Incident",
                    category=inc.category or "other",
                    urgency=inc.urgency or "medium",
                    status=inc.status or "reported",
                    weight=weight,
                ),
            )
        )

    return HotspotFeatureCollection(type="FeatureCollection", features=features)

async def get_category_breakdown(session: AsyncSession) -> CategoryBreakdown:
    """Breakdown of incident counts and percentages grouped by category."""
    stmt = select(Incident.category, func.count(Incident.id)).group_by(Incident.category)
    result = await session.execute(stmt)
    rows = result.all()

    total = sum(count for _, count in rows)
    categories = []

    for cat_code, count in rows:
        name = CATEGORY_NAMES.get(cat_code, cat_code.replace("_", " ").title())
        pct = round((count / total) * 100, 1) if total > 0 else 0.0
        categories.append(
            CategoryCount(
                category=cat_code,
                name=name,
                count=count,
                percentage=pct,
            )
        )

    # Sort descending by count
    categories.sort(key=lambda x: x.count, reverse=True)

    return CategoryBreakdown(categories=categories, total=total)

def _calc_avg_and_p95(values: List[float], fallback_avg: float, fallback_p95: float) -> tuple[float, float]:
    """Compute rounded average and 95th percentile from duration samples with safe empty fallback."""
    if not values:
        return fallback_avg, fallback_p95
    sorted_vals = sorted(values)
    avg_val = round(sum(sorted_vals) / len(sorted_vals), 1)
    p95_idx = min(len(sorted_vals) - 1, math.ceil(0.95 * len(sorted_vals)) - 1)
    p95_val = round(sorted_vals[max(0, p95_idx)], 1)
    return avg_val, p95_val


async def get_response_time_stats(session: AsyncSession) -> ResponseTimeStats:
    """Compute real response-phase milestones and daily volume/response timeline from Assignment & Incident rows."""
    assign_stmt = select(Assignment)
    assignments = (await session.execute(assign_stmt)).scalars().all()

    dispatch_samples: List[float] = []
    en_route_samples: List[float] = []
    on_scene_samples: List[float] = []

    for a in assignments:
        if a.acknowledged_at and a.offered_at and a.acknowledged_at > a.offered_at:
            dispatch_samples.append((a.acknowledged_at - a.offered_at).total_seconds())
        if a.completed_at and a.acknowledged_at and a.completed_at > a.acknowledged_at:
            en_route_samples.append((a.completed_at - a.acknowledged_at).total_seconds())
        if a.completed_at and a.offered_at and a.completed_at > a.offered_at:
            on_scene_samples.append((a.completed_at - a.offered_at).total_seconds())

    disp_avg, disp_p95 = _calc_avg_and_p95(dispatch_samples, 0.0, 0.0)
    enr_avg, enr_p95 = _calc_avg_and_p95(en_route_samples, 0.0, 0.0)
    ons_avg, ons_p95 = _calc_avg_and_p95(on_scene_samples, 0.0, 0.0)

    milestones = [
        ResponseMilestone(phase="dispatch", avg_seconds=disp_avg, p95_seconds=disp_p95),
        ResponseMilestone(phase="en_route", avg_seconds=enr_avg, p95_seconds=enr_p95),
        ResponseMilestone(phase="on_scene", avg_seconds=ons_avg, p95_seconds=ons_p95),
    ]

    # Timeline from recent incidents + daily average response duration from completed assignments
    today = datetime.utcnow().date()
    timeline = []

    for i in range(5, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%a")
        count = (
            await session.execute(
                select(func.count(Incident.id)).where(func.date(Incident.created_at) == day)
            )
        ).scalar() or 0

        day_durations = [
            (a.completed_at - a.offered_at).total_seconds()
            for a in assignments
            if a.completed_at and a.offered_at and a.completed_at > a.offered_at and a.offered_at.date() == day
        ]
        day_avg = round(sum(day_durations) / len(day_durations), 1) if day_durations else 0.0

        timeline.append(
            TimelinePoint(
                date=day_str,
                avg_response_seconds=day_avg,
                count=count,
            )
        )

    return ResponseTimeStats(milestones=milestones, timeline=timeline)
