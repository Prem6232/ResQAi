from datetime import datetime, timedelta
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.common.spatial import normalize_legacy_coords_to_bhopal
from app.core.exceptions import AppException, ForbiddenError
from app.models.entities import (
    Assignment,
    AuditLog,
    Incident,
    IncidentReport,
    IncidentStatusEvent,
    Report,
    ResponderProfile,
    User,
)
from app.modules.operator.service import (
    advance_incident_state,
    dispatch_responder_offer,
    get_dispatch_recommendations,
    merge_reports_action,
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
    """Step an async coroutine with pre-resolved AsyncMocks without needing OS socketpair handles."""
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _make_user(role: str = "operator", email: str = "op@bhopal.resqai", full_name: str = "Control Operator") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="argon2-stub",
        full_name=full_name,
        role=role,
        is_active=True,
    )


def _make_incident(lat: float = 23.2599, lng: float = 77.4126, status: str = "reported") -> Incident:
    return Incident(
        id=uuid.uuid4(),
        public_code="INC-901",
        category="fire_smoke",
        urgency="critical",
        status=status,
        title="Lakefront Smoke Plume",
        location=from_shape(Point(lng, lat), srid=4326),
        location_label="VIP Road, Bhopal",
        evidence_label="unverified",
        hide_precise_location=False,
    )


def _make_responder(unit_code: str = "F-2", lat: float = 23.2599, lng: float = 77.4126, approved: bool = True) -> ResponderProfile:
    user_id = uuid.uuid4()
    prof = ResponderProfile(
        id=uuid.uuid4(),
        user_id=user_id,
        unit_code=unit_code,
        display_name=f"Fire Unit {unit_code}",
        responder_type="fire_warden",
        capabilities=["firefighting", "rescue"],
        is_on_duty=True,
        availability_status="available",
        share_location=True,
        is_approved=approved,
        last_known_location=from_shape(Point(lng, lat), srid=4326),
    )
    prof.user = User(id=user_id, email=f"{unit_code.lower()}@resqai.in", hashed_password="x", full_name=f"Crew {unit_code}", role="responder")
    return prof


def test_normalize_legacy_coords_shifts_delhi_seed_to_bhopal_and_preserves_bhopal():
    bhopal_lat, bhopal_lng = normalize_legacy_coords_to_bhopal(28.5464, 77.2741)
    assert 23.15 <= bhopal_lat <= 23.36
    assert 77.30 <= bhopal_lng <= 77.55

    same_lat, same_lng = normalize_legacy_coords_to_bhopal(23.2599, 77.4126)
    assert (same_lat, same_lng) == (23.2599, 77.4126)


def test_dispatch_recommendations_normalize_legacy_delhi_incident_preventing_588km_eta():
    legacy_delhi_incident = _make_incident(lat=28.5464, lng=77.2741, status="confirmed")
    bhopal_responder = _make_responder(unit_code="F-2", lat=23.2599, lng=77.4126)

    inc_res = MagicMock()
    inc_res.scalar_one_or_none.return_value = legacy_delhi_incident
    resp_res = MagicMock()
    resp_res.scalars.return_value.all.return_value = [bhopal_responder]

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[inc_res, resp_res])

    recs = _drive_coro(get_dispatch_recommendations(db, str(legacy_delhi_incident.id)))

    assert len(recs) == 1
    assert recs[0].unitCode == "F-2"
    assert recs[0].distanceKm < 5.0
    assert recs[0].etaMinutes < 15


def test_operator_advance_incident_state_enforces_transitions_and_logs_audit():
    operator = _make_user("operator")
    incident = _make_incident(status="reported")

    first_res = MagicMock()
    first_res.scalar_one_or_none.return_value = incident
    refetch_res = MagicMock()
    refetch_res.scalar_one.return_value = incident

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[first_res, refetch_res])
    db.add = MagicMock()
    db.commit = AsyncMock()

    with patch("app.modules.operator.service.create_outbox_event", AsyncMock()):
        updated = _drive_coro(advance_incident_state(db, operator, str(incident.id), "under_review", "Initial triage"))

    assert updated.status == "under_review"
    added_objs = [call.args[0] for call in db.add.call_args_list]
    status_ev = next(obj for obj in added_objs if isinstance(obj, IncidentStatusEvent))
    audit = next(obj for obj in added_objs if isinstance(obj, AuditLog))
    assert status_ev.from_status == "reported"
    assert status_ev.to_status == "under_review"
    assert audit.action == "UPDATE_INCIDENT_STATE"

    # Illegal transition (reported -> closed directly) raises 400
    closed_inc = _make_incident(status="closed")
    bad_res = MagicMock()
    bad_res.scalar_one_or_none.return_value = closed_inc
    db_bad = MagicMock()
    db_bad.execute = AsyncMock(return_value=bad_res)

    with pytest.raises(AppException) as exc_info:
        _drive_coro(advance_incident_state(db_bad, operator, str(closed_inc.id), "under_review", "Invalid jump"))
    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "ILLEGAL_STATE_TRANSITION"


def test_operator_override_ai_classification_updates_category_urgency_and_audit():
    operator = _make_user("operator")
    incident = _make_incident(status="under_review")

    find_res = MagicMock()
    find_res.scalar_one_or_none.return_value = incident
    refetch_res = MagicMock()
    refetch_res.scalar_one.return_value = incident

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[find_res, refetch_res])
    db.add = MagicMock()
    db.commit = AsyncMock()

    updated = _drive_coro(
        override_ai_assessment_action(
            db, operator, str(incident.id), "medical", "medium", "Verified minor injury rather than fire"
        )
    )

    assert updated.category == "medical"
    assert updated.urgency == "medium"
    assert updated.evidence_label == "confirmed_by_operator"
    audit = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], AuditLog))
    assert audit.action == "OVERRIDE_AI"
    assert audit.details["new_category"] == "medical"
    assert audit.details["new_urgency"] == "medium"


def test_operator_merge_reports_relinks_reports_and_writes_outbox():
    operator = _make_user("operator")
    target = _make_incident(status="confirmed")
    target.report_links = []
    report_id = uuid.uuid4()
    report = Report(
        id=report_id,
        reporter_id=uuid.uuid4(),
        channel="form",
        category="fire_smoke",
        urgency="high",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
        location_label="DB Mall Square, Bhopal",
        raw_text="Secondary smoke sighting",
    )

    find_res = MagicMock()
    find_res.scalar_one_or_none.return_value = target
    old_links_res = MagicMock()
    old_links_res.scalars.return_value.all.return_value = []

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[find_res, old_links_res])
    db.get = AsyncMock(return_value=report)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    with patch("app.modules.operator.service.create_outbox_event", AsyncMock()) as mock_outbox:
        merged = _drive_coro(
            merge_reports_action(db, operator, str(target.id), [str(report_id)], "Duplicate smoke reports")
        )

    assert merged.id == target.id
    assert len(merged.report_links) == 1
    assert isinstance(merged.report_links[0], IncidentReport)
    mock_outbox.assert_awaited_once()
    audit = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], AuditLog))
    assert audit.action == "MERGE_REPORTS"


def test_operator_dispatch_responder_offer_rejects_unapproved_and_broadcasts_valid_offer():
    operator = _make_user("operator")
    incident = _make_incident(lat=28.5464, lng=77.2741, status="confirmed")
    unapproved = _make_responder("U-9", approved=False)

    inc_res = MagicMock()
    inc_res.scalar_one_or_none.return_value = incident
    unapp_res = MagicMock()
    unapp_res.scalar_one_or_none.return_value = unapproved
    db_err = MagicMock()
    db_err.execute = AsyncMock(side_effect=[inc_res, unapp_res])

    with pytest.raises(AppException) as exc_info:
        _drive_coro(dispatch_responder_offer(db_err, operator, str(incident.id), str(unapproved.id)))
    assert exc_info.value.code == "RESPONDER_NOT_APPROVED"

    approved = _make_responder("F-2", lat=23.2599, lng=77.4126, approved=True)
    assignment_holder = {}

    def fake_add(obj):
        if isinstance(obj, Assignment):
            obj.id = uuid.uuid4()
            assignment_holder["asg"] = obj

    inc_res_ok = MagicMock()
    inc_res_ok.scalar_one_or_none.return_value = incident
    resp_res_ok = MagicMock()
    resp_res_ok.scalar_one_or_none.return_value = approved
    reload_res = MagicMock()
    call_idx = {"i": 0}

    async def sequenced_execute(stmt):
        i = call_idx["i"]
        call_idx["i"] += 1
        if i == 0:
            return inc_res_ok
        if i == 1:
            return resp_res_ok
        reload_res.scalar_one.return_value = assignment_holder["asg"]
        return reload_res

    db_ok = MagicMock()
    db_ok.execute = AsyncMock(side_effect=sequenced_execute)
    db_ok.add = MagicMock(side_effect=fake_add)
    db_ok.flush = AsyncMock()
    db_ok.commit = AsyncMock()
    fake_outbox = MagicMock(event_type="assignment.offered")

    with (
        patch("app.modules.operator.service.create_outbox_event", AsyncMock(return_value=fake_outbox)),
        patch("app.modules.operator.service.broadcast_outbox_event", AsyncMock()) as mock_broadcast,
    ):
        dispatched = _drive_coro(dispatch_responder_offer(db_ok, operator, str(incident.id), str(approved.id), "Dispatch now"))

    assert dispatched.distance_km < 5.0
    assert approved.availability_status == "busy"
    mock_broadcast.assert_awaited_once_with(fake_outbox)


def test_responder_accept_and_transitions_preserve_from_status_and_broadcast_events():
    responder_prof = _make_responder("F-2")
    responder_user = responder_prof.user
    incident = _make_incident(status="confirmed")
    asg = Assignment(
        id=uuid.uuid4(),
        incident_id=incident.id,
        responder_id=responder_prof.id,
        status="offered",
        offered_at=datetime.utcnow(),
        offer_deadline=datetime.utcnow() + timedelta(seconds=60),
        eta_minutes=3,
        distance_km=0.5,
    )
    asg.incident = incident
    asg.responder = responder_prof

    prof_res = MagicMock()
    prof_res.scalar_one_or_none.return_value = responder_prof
    asg_res = MagicMock()
    asg_res.scalar_one_or_none.return_value = asg

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[prof_res, asg_res])
    db.add = MagicMock()
    db.commit = AsyncMock()
    offer_outbox = MagicMock(event_type="assignment.updated")

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=offer_outbox)),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_broadcast,
    ):
        resp_dto = _drive_coro(respond_to_assignment_offer(db, responder_user, str(asg.id), accept=True, reason="Rolling"))

    assert resp_dto.status == "accepted"
    assert incident.status == "assigned"
    inc_ev = next(c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], IncidentStatusEvent))
    assert inc_ev.from_status == "confirmed"
    assert inc_ev.to_status == "assigned"
    mock_broadcast.assert_awaited_once_with(offer_outbox)

    # Now advance en_route -> arrived -> completed
    for target, expected_inc_from, expected_inc_to in [
        ("en_route", "assigned", "en_route"),
        ("arrived", "en_route", "on_scene"),
        ("completed", "on_scene", "resolved"),
    ]:
        step_prof_res = MagicMock()
        step_prof_res.scalar_one_or_none.return_value = responder_prof
        step_asg_res = MagicMock()
        step_asg_res.scalar_one_or_none.return_value = asg

        step_db = MagicMock()
        step_db.execute = AsyncMock(side_effect=[step_asg_res, step_prof_res])
        step_db.add = MagicMock()
        step_db.commit = AsyncMock()
        step_ev = MagicMock(event_type="assignment.updated")

        with (
            patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=step_ev)),
            patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_step_bcast,
        ):
            _drive_coro(update_assignment_status_action(step_db, responder_user, str(asg.id), target, reason=f"Step {target}"))

        step_inc_ev = next(c.args[0] for c in step_db.add.call_args_list if isinstance(c.args[0], IncidentStatusEvent))
        assert step_inc_ev.from_status == expected_inc_from
        assert step_inc_ev.to_status == expected_inc_to
        mock_step_bcast.assert_awaited_once_with(step_ev)

    assert responder_prof.availability_status == "available"


def test_responder_notes_idor_and_location_ping_normalization_and_offer_expiry():
    owner_prof = _make_responder("F-2")
    other_prof = _make_responder("A-12")
    other_user = other_prof.user
    incident = _make_incident(lat=28.5464, lng=77.2741, status="en_route")
    asg = Assignment(
        id=uuid.uuid4(),
        incident_id=incident.id,
        responder_id=owner_prof.id,
        status="en_route",
    )
    asg.incident = incident
    asg.responder = owner_prof

    # IDOR: A-12 cannot append notes to F-2's assignment
    asg_res = MagicMock()
    asg_res.scalar_one_or_none.return_value = asg
    other_prof_res = MagicMock()
    other_prof_res.scalar_one_or_none.return_value = other_prof
    db_idor = MagicMock()
    db_idor.execute = AsyncMock(side_effect=[asg_res, other_prof_res])

    with pytest.raises(ForbiddenError):
        _drive_coro(append_assignment_notes(db_idor, other_user, str(asg.id), "Injected note"))

    # Owner responder can append notes
    asg_res2 = MagicMock()
    asg_res2.scalar_one_or_none.return_value = asg
    owner_prof_res = MagicMock()
    owner_prof_res.scalar_one_or_none.return_value = owner_prof
    db_owner = MagicMock()
    db_owner.execute = AsyncMock(side_effect=[asg_res2, owner_prof_res])
    db_owner.add = MagicMock()
    db_owner.commit = AsyncMock()
    updated_asg = _drive_coro(append_assignment_notes(db_owner, owner_prof.user, str(asg.id), "Hydrant pressure steady"))
    assert "Hydrant pressure steady" in (updated_asg.routeNote or "")

    # Location ping normalizes legacy Delhi incident vs Bhopal responder
    ping_prof_res = MagicMock()
    ping_prof_res.scalar_one_or_none.return_value = owner_prof
    ping_asg_res = MagicMock()
    ping_asg_res.scalars.return_value.first.return_value = asg
    db_ping = MagicMock()
    db_ping.execute = AsyncMock(side_effect=[ping_prof_res, ping_asg_res])
    db_ping.commit = AsyncMock()
    loc_outbox = MagicMock(event_type="responder.location")

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=loc_outbox)),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_loc_bcast,
    ):
        ping_res = _drive_coro(ingest_responder_location_ping(db_ping, owner_prof.user, 23.2599, 77.4126))

    assert ping_res["distanceKm"] < 5.0
    assert ping_res["etaMinutes"] < 15
    mock_loc_bcast.assert_awaited_once_with(loc_outbox)

    # Auto-expire broadcasts expired events and restores availability
    expired_offer = Assignment(
        id=uuid.uuid4(),
        incident_id=incident.id,
        responder_id=owner_prof.id,
        status="offered",
        offer_deadline=datetime.utcnow() - timedelta(seconds=10),
    )
    owner_prof.availability_status = "busy"
    expired_offer.responder = owner_prof
    exp_res = MagicMock()
    exp_res.scalars.return_value.all.return_value = [expired_offer]
    db_exp = MagicMock()
    db_exp.execute = AsyncMock(return_value=exp_res)
    db_exp.add = MagicMock()
    db_exp.commit = AsyncMock()
    exp_outbox = MagicMock(event_type="assignment.expired")

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=exp_outbox)),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_exp_bcast,
    ):
        count = _drive_coro(auto_expire_assignment_offers(db_exp))

    assert count == 1
    assert expired_offer.status == "expired"
    assert owner_prof.availability_status == "available"
    mock_exp_bcast.assert_awaited_once_with(exp_outbox)
