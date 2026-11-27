from datetime import datetime, timedelta
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.core.exceptions import AppException, ForbiddenError
from app.models.entities import (
    Assignment,
    AssignmentEvent,
    AuditLog,
    Incident,
    IncidentStatusEvent,
    ResponderProfile,
    User,
)
from app.modules.responder.schemas import DutyUpdateRequest
from app.modules.responder.service import (
    get_active_assignments_for_user,
    get_assignment_history_for_user,
    get_responder_self_profile,
    respond_to_assignment_offer,
    toggle_duty_status,
    update_assignment_status_action,
)


def _drive_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _make_responder(unit_code: str = "F-2"):
    uid = uuid.uuid4()
    prof = ResponderProfile(
        id=uuid.uuid4(),
        user_id=uid,
        unit_code=unit_code,
        display_name=f"Unit {unit_code}",
        responder_type="fire_warden",
        capabilities=["firefighting", "rescue"],
        is_on_duty=True,
        availability_status="available",
        share_location=True,
        is_approved=True,
        last_known_location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    prof.user = User(
        id=uid,
        email=f"{unit_code.lower()}@bhopal.resqai",
        hashed_password="x",
        full_name=f"Crew {unit_code}",
        role="responder",
        is_active=True,
    )
    return prof


def _make_incident(status: str = "assigned"):
    return Incident(
        id=uuid.uuid4(),
        public_code="INC-501",
        category="fire_smoke",
        urgency="critical",
        status=status,
        title="Bhopal Habibganj Fire Alert",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
        location_label="Habibganj, Bhopal",
        evidence_label="confirmed_by_operator",
        hide_precise_location=False,
    )


def test_duty_update_request_and_toggle_persists_share_location():
    req = DutyUpdateRequest(isOnDuty=False, availabilityStatus="off_duty", shareLocation=False)
    assert req.is_on_duty is False
    assert req.availability_status == "off_duty"
    assert req.share_location is False

    prof = _make_responder("F-2")
    prof_res = MagicMock()
    prof_res.scalar_one_or_none.return_value = prof
    db = MagicMock()
    db.execute = AsyncMock(return_value=prof_res)
    db.commit = AsyncMock()

    out = _drive_coro(
        toggle_duty_status(db, prof.user, is_on_duty=False, share_location=False)
    )
    assert prof.is_on_duty is False
    assert prof.availability_status == "off_duty"
    assert prof.share_location is False
    assert out["shareLocation"] is False


def test_get_active_assignments_expires_overdue_offers_and_broadcasts_outbox():
    prof = _make_responder("F-2")
    prof.availability_status = "busy"
    inc = _make_incident(status="assigned")
    overdue = Assignment(
        id=uuid.uuid4(),
        incident_id=inc.id,
        responder_id=prof.id,
        status="offered",
        offered_at=datetime.utcnow() - timedelta(minutes=3),
        offer_deadline=datetime.utcnow() - timedelta(seconds=30),
    )
    overdue.incident = inc

    prof_res = MagicMock()
    prof_res.scalar_one_or_none.return_value = prof
    asg_res = MagicMock()
    asg_res.scalars.return_value.all.return_value = [overdue]

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[prof_res, asg_res])
    db.add = MagicMock()
    db.commit = AsyncMock()
    exp_outbox = MagicMock(event_type="assignment.expired")

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=exp_outbox)),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_bcast,
    ):
        active = _drive_coro(get_active_assignments_for_user(db, prof.user))

    assert active == []
    assert overdue.status == "expired"
    assert prof.availability_status == "available"
    assert inc.status == "confirmed"
    added = [c.args[0] for c in db.add.call_args_list]
    assert any(isinstance(o, AssignmentEvent) and o.to_status == "expired" for o in added)
    assert any(isinstance(o, IncidentStatusEvent) and o.to_status == "confirmed" for o in added)
    mock_bcast.assert_awaited_once_with(exp_outbox)


def test_responder_decline_and_failed_escalation_reopen_assigned_incident_and_reject_illegal_jumps():
    prof = _make_responder("F-2")
    prof.availability_status = "busy"
    inc = _make_incident(status="assigned")
    offer = Assignment(
        id=uuid.uuid4(),
        incident_id=inc.id,
        responder_id=prof.id,
        status="offered",
        offered_at=datetime.utcnow(),
        offer_deadline=datetime.utcnow() + timedelta(seconds=60),
    )
    offer.incident = inc
    offer.responder = prof

    prof_res = MagicMock()
    prof_res.scalar_one_or_none.return_value = prof
    asg_res = MagicMock()
    asg_res.scalar_one_or_none.return_value = offer

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[prof_res, asg_res])
    db.add = MagicMock()
    db.commit = AsyncMock()
    ev_outbox = MagicMock(event_type="assignment.updated")

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(return_value=ev_outbox)),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()),
    ):
        declined = _drive_coro(
            respond_to_assignment_offer(db, prof.user, str(offer.id), accept=False, reason="Crew swap")
        )

    assert declined.status == "declined"
    assert prof.availability_status == "available"
    assert inc.status == "confirmed"
    assert any(isinstance(c.args[0], AuditLog) and c.args[0].action == "DECLINE_OFFER" for c in db.add.call_args_list)

    # Illegal transition accepted -> completed directly raises 400
    accepted_asg = Assignment(
        id=uuid.uuid4(),
        incident_id=inc.id,
        responder_id=prof.id,
        status="accepted",
    )
    bad_asg_res = MagicMock()
    bad_asg_res.scalar_one_or_none.return_value = accepted_asg
    bad_prof_res = MagicMock()
    bad_prof_res.scalar_one_or_none.return_value = prof
    db_bad = MagicMock()
    db_bad.execute = AsyncMock(side_effect=[bad_asg_res, bad_prof_res])

    with pytest.raises(AppException) as exc:
        _drive_coro(update_assignment_status_action(db_bad, prof.user, str(accepted_asg.id), "completed"))
    assert exc.value.code == "ILLEGAL_STATE_TRANSITION"

    # Mission failure from en_route reopens incident -> confirmed and broadcasts both failed + updated
    inc2 = _make_incident(status="en_route")
    en_route_asg = Assignment(
        id=uuid.uuid4(),
        incident_id=inc2.id,
        responder_id=prof.id,
        status="en_route",
    )
    en_route_asg.incident = inc2
    en_route_asg.responder = prof
    f_asg_res = MagicMock()
    f_asg_res.scalar_one_or_none.return_value = en_route_asg
    f_prof_res = MagicMock()
    f_prof_res.scalar_one_or_none.return_value = prof
    db_fail = MagicMock()
    db_fail.execute = AsyncMock(side_effect=[f_asg_res, f_prof_res])
    db_fail.add = MagicMock()
    db_fail.commit = AsyncMock()

    with (
        patch("app.modules.responder.service.create_outbox_event", AsyncMock(side_effect=[MagicMock(), MagicMock()])),
        patch("app.modules.responder.service.broadcast_outbox_event", AsyncMock()) as mock_fail_bcast,
    ):
        failed_dto = _drive_coro(
            update_assignment_status_action(
                db_fail, prof.user, str(en_route_asg.id), "failed", explanation="Road flooded"
            )
        )

    assert failed_dto.status == "failed"
    assert inc2.status == "confirmed"
    assert mock_fail_bcast.await_count == 2


def test_responder_self_profile_history_and_cross_unit_rejection():
    prof = _make_responder("F-2")
    other = _make_responder("P-07")
    inc = _make_incident(status="resolved")
    past = Assignment(
        id=uuid.uuid4(),
        incident_id=inc.id,
        responder_id=prof.id,
        status="completed",
        offered_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
        eta_minutes=3,
        distance_km=0.6,
    )
    past.incident = inc

    # Self profile
    p_res = MagicMock()
    p_res.scalar_one_or_none.return_value = prof
    db_p = MagicMock()
    db_p.execute = AsyncMock(return_value=p_res)
    profile_dto = _drive_coro(get_responder_self_profile(db_p, prof.user))
    assert profile_dto.unitCode == "F-2"
    assert profile_dto.lastLocation["lat"] == pytest.approx(23.2599, abs=1e-4)

    # History
    h_prof_res = MagicMock()
    h_prof_res.scalar_one_or_none.return_value = prof
    h_list_res = MagicMock()
    h_list_res.scalars.return_value.all.return_value = [past]
    db_h = MagicMock()
    db_h.execute = AsyncMock(side_effect=[h_prof_res, h_list_res])
    hist = _drive_coro(get_assignment_history_for_user(db_h, prof.user))
    assert len(hist) == 1
    assert hist[0].status == "completed"

    # Cross-unit offer response rejected with ForbiddenError
    x_prof_res = MagicMock()
    x_prof_res.scalar_one_or_none.return_value = other
    x_asg_res = MagicMock()
    x_asg_res.scalar_one_or_none.return_value = past
    db_x = MagicMock()
    db_x.execute = AsyncMock(side_effect=[x_prof_res, x_asg_res])
    with pytest.raises(ForbiddenError):
        _drive_coro(respond_to_assignment_offer(db_x, other.user, str(past.id), accept=True))
