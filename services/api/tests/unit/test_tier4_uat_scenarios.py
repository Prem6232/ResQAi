import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.ai.adapters.text_classifier import TextClassifierAdapter
from app.core.exceptions import AppException, ForbiddenError
from app.models.entities import (
    Assignment,
    AuditLog,
    Incident,
    IncidentReport,
    OperatingArea,
    Report,
    ResponderProfile,
    TrustedContact,
    User,
)
from app.modules.admin.schemas import PolygonUpdateRequest
from app.modules.admin.service import approve_or_revoke_responder, toggle_system_drill_mode, update_campus_operating_area
from app.modules.auth.dependencies import require_approved_responder
from app.modules.citizen.schemas import SOSRequest, TrustedContactCreate
from app.modules.citizen.service import (
    add_user_contact,
    cancel_citizen_report,
    create_sos_beacon,
    get_nearby_alerts,
    request_citizen_data_deletion,
)
from app.modules.operator.service import (
    get_dispatch_recommendations,
    override_ai_assessment_action,
)
from app.modules.responder.service import (
    append_assignment_notes,
    auto_expire_assignment_offers,
    ingest_responder_location_ping,
    respond_to_assignment_offer,
    update_assignment_status_action,
)


def _drive_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _user(role: str, email: str, name: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="hash",
        full_name=name,
        role=role,
        is_active=True,
        created_at=datetime.utcnow(),
    )


def _res_row(scalar=None, rows=None):
    res = MagicMock()
    res.scalar_one_or_none.return_value = scalar
    res.scalar_one.return_value = scalar
    res.scalar.return_value = scalar
    res.scalars.return_value.all.return_value = rows if rows is not None else ([scalar] if scalar is not None else [])
    return res


def _make_db(*, execute_side_effect=None, execute_return=None, scalar_return=None, captured=None):
    """Build a synchronous-awaitable AsyncSession mock with id/timestamp defaults on add()."""
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.scalar = AsyncMock(return_value=scalar_return)

    def _add(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.utcnow()
        if captured is not None:
            captured.append(obj)

    db.add.side_effect = _add
    if execute_side_effect is not None:
        db.execute = AsyncMock(side_effect=execute_side_effect)
    elif execute_return is not None:
        db.execute = AsyncMock(return_value=execute_return)
    return db


# ---------------------------------------------------------------------------
# UAT-1: Campus Student SOS & 100m Privacy Coarsening Near Arera Colony
# ---------------------------------------------------------------------------

def test_uat1_student_sos_idempotency_and_privacy_coarsening():
    student = _user("citizen", "ananya.student@bhopal.edu", "Ananya Student")
    persisted = []

    saved_report = Report(
        id=uuid.uuid4(),
        reporter_id=student.id,
        channel="sos",
        category="personal_safety",
        urgency="critical",
        raw_text="CRITICAL PERSONAL SOS",
        location=from_shape(Point(77.4344, 23.2167), srid=4326),
        location_label="Bhopal Metro SOS",
        status="submitted",
        processing_state="received",
        delivery_state="received_by_server",
        idempotency_key="uat-sos-arera-01",
        created_at=datetime.utcnow(),
    )

    # First tap persists SOS report + OUTBOX_SOS_CREATED
    sos_incident_stub = Incident(
        id=uuid.uuid4(),
        public_code="SOS-410",
        category="personal_safety",
        urgency="critical",
        status="reported",
        title="Ananya Personal SOS",
        location=from_shape(Point(77.43444, 23.21674), srid=4326),
        location_label="10 No. Market Lane, Arera Colony",
        hide_precise_location=True,
        created_at=datetime.utcnow(),
    )
    db1 = _make_db(execute_side_effect=[_res_row(scalar=None), _res_row(scalar=saved_report)], captured=persisted)

    with (
        patch("app.modules.operator.service.cluster_report_to_incident", new=AsyncMock(return_value=sos_incident_stub)),
        patch("app.modules.citizen.service.broadcast_outbox_event", new=AsyncMock(return_value=1)),
    ):
        dto1, created1 = _drive_coro(
            create_sos_beacon(
                db1,
                student,
                SOSRequest(
                    location={"lat": 23.21674, "lng": 77.43444, "source": "gps"},
                    idempotencyKey="uat-sos-arera-01",
                ),
            )
        )
    assert created1 is True
    assert dto1.channel == "sos"
    assert dto1.urgency == "critical"

    # Retried tap with same idempotencyKey returns existing report without duplicating
    db2 = _make_db(execute_return=_res_row(scalar=saved_report))
    dto2, created2 = _drive_coro(
        create_sos_beacon(
            db2,
            student,
            SOSRequest(location={"lat": 23.21674, "lng": 77.43444}, idempotencyKey="uat-sos-arera-01"),
        )
    )
    assert created2 is False
    assert dto2.id == dto1.id

    # Nearby alert feed hides reporter identity and coarsens sensitive pinpoint (~100m grid)
    sos_incident = Incident(
        id=uuid.uuid4(),
        public_code="SOS-410",
        category="personal_safety",
        urgency="critical",
        status="reported",
        title="Ananya Personal SOS",
        location=from_shape(Point(77.43444, 23.21674), srid=4326),
        location_label="10 No. Market Lane, Arera Colony",
        hide_precise_location=True,
        created_at=datetime.utcnow(),
    )
    db_alerts = _make_db(execute_return=_res_row(rows=[sos_incident]))
    alerts = _drive_coro(get_nearby_alerts(db_alerts, lat=23.2167, lng=77.4344, radius_km=5.0))
    assert len(alerts) == 1
    assert alerts[0].coarsened is True
    assert "Bhopal Metro Area" in alerts[0].title
    assert "10 No. Market Lane" not in alerts[0].title
    assert alerts[0].location["lat"] != 23.21674
    assert alerts[0].location["lng"] != 77.43444


# ---------------------------------------------------------------------------
# UAT-2: Monsoon Waterlogging Triage, AI Override & Realistic Bhopal ETA
# ---------------------------------------------------------------------------

def test_uat2_flood_override_and_bhopal_recommendation_eta():
    op = _user("operator", "cmd@bhopal.resqai", "Control Room Lead")
    clf = TextClassifierAdapter(mode="mock")
    ai = _drive_coro(clf.predict("Heavy monsoon flooding submerging Habibganj underpass"))
    assert ai.suggestedCategory == "water_flood"

    inc = Incident(
        id=uuid.uuid4(),
        public_code="INC-512",
        category="hazard",
        urgency="medium",
        status="reported",
        title="Habibganj Underpass Flooding",
        location=from_shape(Point(77.4343, 23.2332), srid=4326),
        location_label="Habibganj Underpass, Bhopal",
        evidence_label="corroborated",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    resp_r1 = ResponderProfile(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        unit_code="R-1",
        display_name="Rescue Van R-1",
        responder_type="volunteer",
        capabilities=["rescue", "hazard"],
        is_on_duty=True,
        availability_status="available",
        share_location=True,
        is_approved=True,
        last_known_location=from_shape(Point(77.2732, 28.5450), srid=4326),
    )

    db_ovr = _make_db(execute_side_effect=[_res_row(scalar=inc), _res_row(scalar=inc)])
    with patch("app.modules.operator.service.broadcast_outbox_event", new=AsyncMock()):
        overridden = _drive_coro(
            override_ai_assessment_action(
                db_ovr,
                op,
                str(inc.id),
                category="water_flood",
                urgency="critical",
                reason="Verified rising floodwater trapping commuters",
            )
        )
    assert overridden.category == "water_flood"
    assert overridden.urgency == "critical"

    db_rec = _make_db(execute_side_effect=[_res_row(scalar=inc), _res_row(rows=[resp_r1])])
    recs = _drive_coro(get_dispatch_recommendations(db_rec, str(inc.id)))
    assert len(recs) == 1
    assert recs[0].unitCode == "R-1"
    assert recs[0].distanceKm < 10.0


# ---------------------------------------------------------------------------
# UAT-3: Responder 90s Timeout vs En Route -> Failed Escalation Reopens Incident
# ---------------------------------------------------------------------------

def test_uat3_offer_timeout_and_failed_escalation_reopens_incident():
    resp_user = _user("responder", "r1@bhopal.resqai", "Crew R-1")
    prof = ResponderProfile(
        id=uuid.uuid4(),
        user_id=resp_user.id,
        unit_code="R-1",
        display_name="Rescue Van R-1",
        responder_type="volunteer",
        capabilities=["rescue"],
        is_on_duty=True,
        availability_status="available",
        share_location=True,
        is_approved=True,
        last_known_location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    resp_user.responder_profile = prof

    inc_open = Incident(
        id=uuid.uuid4(),
        public_code="INC-610",
        category="water_flood",
        urgency="critical",
        status="assigned",
        title="Submerged Culvert",
        location=from_shape(Point(77.4343, 23.2332), srid=4326),
        location_label="Hoshangabad Rd",
    )

    expired_offer = Assignment(
        id=uuid.uuid4(),
        incident_id=uuid.uuid4(),
        responder_id=prof.id,
        status="offered",
        offered_at=datetime.utcnow() - timedelta(minutes=3),
        offer_deadline=datetime.utcnow() - timedelta(seconds=30),
    )
    active_offer = Assignment(
        id=uuid.uuid4(),
        incident_id=inc_open.id,
        responder_id=prof.id,
        status="offered",
        offered_at=datetime.utcnow(),
        offer_deadline=datetime.utcnow() + timedelta(seconds=90),
    )
    active_offer.incident = inc_open
    active_offer.responder = prof

    # 1. Stale offer past 90s window expires cleanly
    db_exp = _make_db(execute_return=_res_row(rows=[expired_offer]))
    with patch("app.modules.responder.service.broadcast_outbox_event", new=AsyncMock()):
        exp_count = _drive_coro(auto_expire_assignment_offers(db_exp))
    assert exp_count == 1
    assert expired_offer.status == "expired"

    # 2. Responder accepts active offer, goes en_route, logs field note, then escalates as failed
    db_flow = _make_db()
    with patch("app.modules.responder.service.broadcast_outbox_event", new=AsyncMock()):
        db_flow.execute = AsyncMock(side_effect=[_res_row(scalar=prof), _res_row(scalar=active_offer)])
        _drive_coro(respond_to_assignment_offer(db_flow, resp_user, str(active_offer.id), accept=True))
        assert active_offer.status == "accepted"

        db_flow.execute = AsyncMock(side_effect=[_res_row(scalar=prof), _res_row(rows=[active_offer])])
        _drive_coro(ingest_responder_location_ping(db_flow, resp_user, lat=23.241, lng=77.425))

        db_flow.execute = AsyncMock(side_effect=[_res_row(scalar=active_offer), _res_row(scalar=prof)])
        _drive_coro(update_assignment_status_action(db_flow, resp_user, str(active_offer.id), target_status="en_route"))
        assert inc_open.status == "en_route"

        db_flow.execute = AsyncMock(side_effect=[_res_row(scalar=active_offer), _res_row(scalar=prof)])
        _drive_coro(append_assignment_notes(db_flow, resp_user, str(active_offer.id), notes="Bridge submerged 1.2m"))
        assert "Bridge submerged 1.2m" in (active_offer.route_note or "")

        db_flow.execute = AsyncMock(side_effect=[_res_row(scalar=active_offer), _res_row(scalar=prof)])
        _drive_coro(
            update_assignment_status_action(
                db_flow,
                resp_user,
                str(active_offer.id),
                target_status="failed",
                reason="Bridge impassable; boat rescue unit required",
            )
        )
    assert active_offer.status == "failed"
    assert inc_open.status == "confirmed"
    assert prof.availability_status == "available"


# ---------------------------------------------------------------------------
# UAT-4: Admin Vetting Gate, Geofence Integrity & Drill Mode Governance
# ---------------------------------------------------------------------------

def test_uat4_admin_vetting_geofence_validation_and_drill_mode():
    admin = _user("admin", "admin@bhopal.resqai", "Platform Admin")
    volunteer = _user("responder", "v9@bhopal.resqai", "Volunteer V-09")
    v9_prof = ResponderProfile(
        id=uuid.uuid4(),
        user_id=volunteer.id,
        unit_code="V-09",
        display_name="Volunteer V-09",
        responder_type="volunteer",
        capabilities=["first_aid"],
        is_on_duty=False,
        availability_status="off_duty",
        share_location=True,
        is_approved=False,
        created_at=datetime.utcnow(),
    )
    v9_prof.user = volunteer
    volunteer.responder_profile = v9_prof

    # Before approval, RBAC dependency blocks field operations
    with pytest.raises(ForbiddenError):
        _drive_coro(require_approved_responder(volunteer))

    # Admin approves V-09
    audits = []
    db_adm = _make_db(execute_side_effect=[_res_row(scalar=v9_prof), _res_row(scalar=None)], captured=audits)
    with patch("app.modules.admin.service.get_redis_client", side_effect=ConnectionError("Redis offline")):
        out_prof = _drive_coro(approve_or_revoke_responder(db_adm, str(v9_prof.id), True, admin))
    assert out_prof.approved is True
    assert _drive_coro(require_approved_responder(volunteer)) is volunteer

    # Self-intersecting geofence rejected; valid Bhopal corridor accepted
    with pytest.raises(Exception):
        _drive_coro(
            update_campus_operating_area(
                db_adm,
                PolygonUpdateRequest(
                    name="Invalid Bowtie",
                    polygon=[[77.35, 23.18], [77.50, 23.32], [77.50, 23.18], [77.35, 23.32]],
                ),
                admin,
            )
        )

    db_geo = _make_db(execute_return=_res_row(scalar=None), captured=audits)
    saved_area = _drive_coro(
        update_campus_operating_area(
            db_geo,
            PolygonUpdateRequest(
                name="Bhopal Monsoon Priority Grid",
                polygon=[[77.36, 23.19], [77.49, 23.19], [77.49, 23.31], [77.36, 23.31]],
            ),
            admin,
        )
    )
    assert saved_area.name == "Bhopal Monsoon Priority Grid"

    # Toggle Drill Mode OFF persists immutable audit record
    with patch("app.modules.admin.service.get_redis_client", side_effect=ConnectionError("Redis offline")):
        drill = _drive_coro(toggle_system_drill_mode(db_geo, False, admin))
    assert drill.drill_mode is False
    assert any(getattr(a, "action", None) == "TOGGLE_DRILL_MODE" for a in audits)


# ---------------------------------------------------------------------------
# UAT-5: Offline Sync Deduplication, Pre-Dispatch Cancel Guard, 3-Contact Limit, GDPR Audit
# ---------------------------------------------------------------------------

def test_uat5_citizen_cancel_guard_contact_cap_and_gdpr_deletion():
    cit = _user("citizen", "vikram@bhopal.in", "Vikram Citizen")
    submitted_rep = Report(
        id=uuid.uuid4(),
        reporter_id=cit.id,
        channel="form",
        category="hazard",
        urgency="medium",
        raw_text="Fallen live wire",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
        location_label="MP Nagar",
        status="submitted",
        processing_state="received",
        delivery_state="received_by_server",
        created_at=datetime.utcnow(),
    )

    # 1. Pre-dispatch cancellation succeeds
    audits = []
    db_cit = _make_db(execute_side_effect=[_res_row(scalar=submitted_rep), _res_row(scalar=submitted_rep)], captured=audits)
    with patch("app.modules.citizen.service.broadcast_outbox_event", new=AsyncMock()):
        cancelled = _drive_coro(cancel_citizen_report(db_cit, cit, str(submitted_rep.id), reason="Municipal crew fixed"))
    assert cancelled.processing_state == "cancelled"

    # 2. Report already linked to an active incident cannot be cancelled
    active_inc = Incident(
        id=uuid.uuid4(),
        public_code="INC-999",
        category="personal_safety",
        urgency="critical",
        status="assigned",
        title="Active Dispatch",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    linked_rep = Report(
        id=uuid.uuid4(),
        reporter_id=cit.id,
        channel="sos",
        category="personal_safety",
        urgency="critical",
        raw_text="Active dispatch SOS",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
        status="linked",
        processing_state="ai_complete",
        delivery_state="received_by_server",
        created_at=datetime.utcnow(),
    )
    link = IncidentReport(incident_id=active_inc.id, report_id=linked_rep.id, incident=active_inc, report=linked_rep)
    linked_rep.incident_links = [link]

    db_cit2 = _make_db(execute_return=_res_row(scalar=linked_rep))
    with pytest.raises(AppException):
        _drive_coro(cancel_citizen_report(db_cit2, cit, str(linked_rep.id), reason="Try cancel"))

    # 3. Fourth trusted contact blocked by 3-contact policy
    db_contacts = _make_db(scalar_return=3)
    with pytest.raises(AppException) as cap_exc:
        _drive_coro(add_user_contact(db_contacts, cit.id, TrustedContactCreate(name="Fourth", phone="+919826000004")))
    assert cap_exc.value.status_code == 400

    # 4. Privacy data deletion records immutable GDPR audit entry
    db_del = _make_db(captured=audits)
    del_res = _drive_coro(request_citizen_data_deletion(db_del, cit, reason="Pilot concluded"))
    assert del_res.ok is True
    assert del_res.status == "queued"
    assert any(getattr(a, "action", None) == "DATA_DELETION_REQUEST" for a in audits)
