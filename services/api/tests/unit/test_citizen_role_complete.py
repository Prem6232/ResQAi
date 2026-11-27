import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.core.exceptions import AppException, ForbiddenError, NotFoundError
from app.models.entities import AuditLog, Incident, IncidentReport, MediaAsset, Report, TrustedContact, User
from app.modules.citizen.alerts_router import fetch_nearby_alerts
from app.modules.citizen.schemas import ReportCreateRequest, SOSRequest, TrustedContactCreate
from app.modules.citizen.service import (
    add_user_contact,
    cancel_citizen_report,
    create_citizen_report,
    create_sos_beacon,
    delete_user_contact,
    get_citizen_report,
    get_nearby_alerts,
    request_citizen_data_deletion,
)


def _drive_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


def _make_citizen(email: str = "cit1@bhopal.in") -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="x",
        full_name="Aarav Citizen",
        role="citizen",
        is_active=True,
    )


def _make_report(citizen: User, status: str = "submitted", processing: str = "received") -> Report:
    return Report(
        id=uuid.uuid4(),
        reporter_id=citizen.id,
        channel="form",
        category="water_flood",
        urgency="high",
        raw_text="Stormwater overflow at Habibganj underpass",
        location=from_shape(Point(77.4343, 23.2332), srid=4326),
        location_label="Habibganj, Bhopal",
        status=status,
        processing_state=processing,
        delivery_state="received_by_server",
        created_at=datetime.utcnow(),
    )


def test_sos_beacon_idempotency_and_realtime_broadcast():
    citizen = _make_citizen()
    existing = _make_report(citizen)
    existing.channel = "sos"
    existing.category = "personal_safety"
    existing.urgency = "critical"

    # 1. Duplicate idempotencyKey returns existing record without creating duplicate outbox
    dup_res = MagicMock()
    dup_res.scalar_one_or_none.return_value = existing
    db_dup = MagicMock()
    db_dup.execute = AsyncMock(return_value=dup_res)
    payload = SOSRequest(location={"lat": 23.2599, "lng": 77.4126}, idempotencyKey="sos-key-1")
    dto, created = _drive_coro(create_sos_beacon(db_dup, citizen, payload))
    assert created is False
    assert dto.id == str(existing.id)

    # 2. Fresh SOS defaults to Bhopal Metro label, emits OUTBOX_SOS_CREATED, and broadcasts immediately
    added_report = {}

    def capture_add(obj):
        if isinstance(obj, Report):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = datetime.utcnow()
            added_report["rep"] = obj

    none_res = MagicMock()
    none_res.scalar_one_or_none.return_value = None
    reload_res = MagicMock()
    idx = {"i": 0}

    async def seq_exec(stmt):
        i = idx["i"]
        idx["i"] += 1
        if i == 0:
            return none_res
        reload_res.scalar_one.return_value = added_report["rep"]
        return reload_res

    db = MagicMock()
    db.execute = AsyncMock(side_effect=seq_exec)
    db.add = MagicMock(side_effect=capture_add)
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    fake_inc = Incident(
        id=uuid.uuid4(),
        public_code="INC-701",
        category="personal_safety",
        urgency="critical",
        status="reported",
        title="SOS",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    sos_outbox = MagicMock(event_type="OUTBOX_SOS_CREATED")
    fresh_payload = SOSRequest(
        location={"lat": 23.2599, "lng": 77.4126},
        location_label="",
        idempotencyKey="sos-key-2",
    )

    with (
        patch("app.modules.operator.service.cluster_report_to_incident", AsyncMock(return_value=fake_inc)),
        patch("app.modules.citizen.service.create_outbox_event", AsyncMock(return_value=sos_outbox)),
        patch("app.modules.citizen.service.broadcast_outbox_event", AsyncMock()) as mock_bcast,
    ):
        dto_new, created_new = _drive_coro(create_sos_beacon(db, citizen, fresh_payload))

    assert created_new is True
    assert dto_new.locationLabel == "Bhopal Metro · Coordinates Broadcasted"
    mock_bcast.assert_awaited_once_with(sos_outbox)


def test_create_report_media_ownership_guard_and_broadcast():
    citizen = _make_citizen()
    unlinked_asset = MediaAsset(id=uuid.uuid4(), file_type="image", s3_key="k1", report_id=None)
    foreign_report_id = uuid.uuid4()
    claimed_asset = MediaAsset(id=uuid.uuid4(), file_type="image", s3_key="k2", report_id=foreign_report_id)

    added_report = {}

    def capture_add(obj):
        if isinstance(obj, Report):
            obj.id = uuid.uuid4()
            obj.created_at = datetime.utcnow()
            added_report["rep"] = obj

    none_res = MagicMock()
    none_res.scalar_one_or_none.return_value = None
    m1_res = MagicMock()
    m1_res.scalar_one_or_none.return_value = unlinked_asset
    m2_res = MagicMock()
    m2_res.scalar_one_or_none.return_value = claimed_asset
    reload_res = MagicMock()

    idx = {"i": 0}

    async def seq_exec(stmt):
        i = idx["i"]
        idx["i"] += 1
        if i == 0:
            return none_res
        if i == 1:
            return m1_res
        if i == 2:
            return m2_res
        reload_res.scalar_one.return_value = added_report["rep"]
        return reload_res

    db = MagicMock()
    db.execute = AsyncMock(side_effect=seq_exec)
    db.add = MagicMock(side_effect=capture_add)
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    fake_inc = Incident(
        id=uuid.uuid4(),
        public_code="INC-702",
        category="water_flood",
        urgency="high",
        status="reported",
        title="Flood",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    rep_outbox = MagicMock(event_type="report.created")
    req = ReportCreateRequest(
        category="water_flood",
        text="Road submerged",
        location={"lat": 23.2599, "lng": 77.4126},
        mediaAssetIds=[str(unlinked_asset.id), str(claimed_asset.id)],
        idempotencyKey="rep-media-1",
    )

    with (
        patch("app.modules.operator.service.cluster_report_to_incident", AsyncMock(return_value=fake_inc)),
        patch("app.modules.citizen.service.create_outbox_event", AsyncMock(return_value=rep_outbox)),
        patch("app.modules.citizen.service.broadcast_outbox_event", AsyncMock()) as mock_bcast,
    ):
        _drive_coro(create_citizen_report(db, citizen, req))

    assert unlinked_asset.report_id == added_report["rep"].id
    assert claimed_asset.report_id == foreign_report_id
    mock_bcast.assert_awaited_once_with(rep_outbox)


def test_citizen_rbac_idempotent_cancel_and_post_dispatch_guard():
    owner = _make_citizen("owner@bhopal.in")
    other = _make_citizen("other@bhopal.in")
    report = _make_report(owner)
    report.incident_links = []

    # Other citizen cannot view report
    view_res = MagicMock()
    view_res.scalar_one_or_none.return_value = report
    db_view = MagicMock()
    db_view.execute = AsyncMock(return_value=view_res)
    with pytest.raises(ForbiddenError):
        _drive_coro(get_citizen_report(db_view, other, str(report.id)))

    # Dispatched incident blocks cancellation with 400
    inc_dispatched = Incident(
        id=uuid.uuid4(),
        public_code="INC-402",
        category="fire_smoke",
        urgency="critical",
        status="assigned",
        title="Active fire",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
    )
    link = IncidentReport(incident_id=inc_dispatched.id, report_id=report.id, incident=inc_dispatched)
    report.incident_links = [link]

    blk_res = MagicMock()
    blk_res.scalar_one_or_none.return_value = report
    db_blk = MagicMock()
    db_blk.execute = AsyncMock(return_value=blk_res)
    with pytest.raises(AppException) as exc:
        _drive_coro(cancel_citizen_report(db_blk, owner, str(report.id), "Too late"))
    assert exc.value.code == "CANNOT_CANCEL_DISPATCHED_INCIDENT"

    # Pre-dispatch cancellation emits & broadcasts report.cancelled
    report.incident_links = []
    c1_res = MagicMock()
    c1_res.scalar_one_or_none.return_value = report
    reload_res = MagicMock()
    reload_res.scalar_one.return_value = report
    db_ok = MagicMock()
    db_ok.execute = AsyncMock(side_effect=[c1_res, reload_res])
    db_ok.commit = AsyncMock()
    db_ok.refresh = AsyncMock()
    cancel_ev = MagicMock(event_type="report.cancelled")

    with (
        patch("app.modules.citizen.service.create_outbox_event", AsyncMock(return_value=cancel_ev)),
        patch("app.modules.citizen.service.broadcast_outbox_event", AsyncMock()) as mock_cbcast,
    ):
        dto = _drive_coro(cancel_citizen_report(db_ok, owner, str(report.id), "Cleared"))

    assert dto.processingState == "cancelled"
    mock_cbcast.assert_awaited_once_with(cancel_ev)

    # Repeating cancel on already-cancelled report returns idempotently without re-broadcasting
    c2_res = MagicMock()
    c2_res.scalar_one_or_none.return_value = report
    db_idem = MagicMock()
    db_idem.execute = AsyncMock(return_value=c2_res)
    with patch("app.modules.citizen.service.create_outbox_event", AsyncMock()) as mock_outbox:
        dto2 = _drive_coro(cancel_citizen_report(db_idem, owner, str(report.id), "Duplicate click"))
    assert dto2.processingState == "cancelled"
    mock_outbox.assert_not_awaited()


def test_nearby_alerts_bhopal_defaults_normalization_and_personal_safety_privacy():
    # Legacy Delhi seed personal_safety incident + Bhopal hazard incident
    sos_inc = Incident(
        id=uuid.uuid4(),
        public_code="SOS-11",
        category="personal_safety",
        urgency="critical",
        status="assigned",
        title="Distress Call",
        location=from_shape(Point(77.2731, 28.5452), srid=4326),
        location_label="Private Hostel Room 204",
        hide_precise_location=True,
    )
    flood_inc = Incident(
        id=uuid.uuid4(),
        public_code="FLD-12",
        category="water_flood",
        urgency="medium",
        status="reported",
        title="Road Waterlogging",
        location=from_shape(Point(77.4126, 23.2599), srid=4326),
        location_label="New Market Square, Bhopal",
        hide_precise_location=False,
    )

    inc_res = MagicMock()
    inc_res.scalars.return_value.all.return_value = [sos_inc, flood_inc]
    db = MagicMock()
    db.execute = AsyncMock(return_value=inc_res)

    alerts = _drive_coro(get_nearby_alerts(db, lat=23.2599, lng=77.4126, radius_km=5.0))
    assert len(alerts) == 2

    # Personal safety must NOT leak "Private Hostel Room 204" into public alert title
    assert "Private Hostel Room 204" not in alerts[0].title
    assert "Bhopal Metro Area" in alerts[0].title
    assert alerts[0].coarsened is True

    # Non-private flood alert shows sanitized neighborhood label
    assert "New Market Square, Bhopal" in alerts[1].title

    # Verify alerts_router query defaults point to Bhopal Metro (23.2599, 77.4126)
    import inspect

    sig = inspect.signature(fetch_nearby_alerts)
    assert sig.parameters["lat"].default.default == pytest.approx(23.2599, abs=1e-4)
    assert sig.parameters["lng"].default.default == pytest.approx(77.4126, abs=1e-4)


def test_contacts_limit_deletion_and_privacy_deletion_audit():
    citizen = _make_citizen()

    # 3 existing contacts blocks 4th with MAX_CONTACTS_REACHED
    db_full = MagicMock()
    db_full.scalar = AsyncMock(return_value=3)
    with pytest.raises(AppException) as exc:
        _drive_coro(
            add_user_contact(
                db_full,
                citizen.id,
                TrustedContactCreate(name="Fourth Contact", phone="+919999999999"),
            )
        )
    assert exc.value.code == "MAX_CONTACTS_REACHED"

    # Missing contact raises NotFoundError; owner deletion deletes cleanly
    db_nf = MagicMock()
    nf_res = MagicMock()
    nf_res.scalar_one_or_none.return_value = None
    db_nf.execute = AsyncMock(return_value=nf_res)
    with pytest.raises(NotFoundError):
        _drive_coro(delete_user_contact(db_nf, citizen.id, str(uuid.uuid4())))

    contact = TrustedContact(id=uuid.uuid4(), user_id=citizen.id, name="Mother", phone="+919876543210")
    db_ok = MagicMock()
    ok_res = MagicMock()
    ok_res.scalar_one_or_none.return_value = contact
    db_ok.execute = AsyncMock(return_value=ok_res)
    db_ok.delete = AsyncMock()
    db_ok.commit = AsyncMock()
    del_out = _drive_coro(delete_user_contact(db_ok, citizen.id, str(contact.id)))
    assert del_out["ok"] is True
    db_ok.delete.assert_awaited_once_with(contact)

    # Privacy deletion persists AuditLog(DATA_DELETION_REQUEST)
    db_del = MagicMock()
    db_del.add = MagicMock()
    db_del.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.id = uuid.uuid4()

    db_del.refresh = AsyncMock(side_effect=fake_refresh)
    res = _drive_coro(
        request_citizen_data_deletion(db_del, citizen, reason="Remove my account data", ip_address="127.0.0.1")
    )
    assert res.ok is True
    assert res.status == "queued"
    audit_entry = db_del.add.call_args.args[0]
    assert isinstance(audit_entry, AuditLog)
    assert audit_entry.action == "DATA_DELETION_REQUEST"
