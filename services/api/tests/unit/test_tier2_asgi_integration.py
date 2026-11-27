import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import Request, Response
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.websockets import WebSocketState

from app.core.database import get_db
from app.core.security import get_password_hash
from app.core.token_store import _in_memory_blacklist, _in_memory_refresh_tokens
from app.main import app
from app.models.entities import (
    Assignment,
    AuditLog,
    Incident,
    IncidentReport,
    OperatingArea,
    OutboxEvent,
    Report,
    ResponderProfile,
    User,
)
from app.modules.realtime.connection_manager import connection_manager
from app.modules.realtime.publisher import broadcast_outbox_event


def _drive_coro(coro):
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        return exc.value


async def _direct_base_middleware_call(self, scope, receive, send):
    """Execute BaseHTTPMiddleware.dispatch inline without spawning an AnyIO task group."""
    if scope["type"] != "http":
        await self.app(scope, receive, send)
        return

    body_bytes = b""
    more = True
    while more:
        chunk = await receive()
        body_bytes += chunk.get("body", b"")
        more = chunk.get("more_body", False)

    sent_once = False

    async def replay_receive():
        nonlocal sent_once
        if not sent_once:
            sent_once = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    request = Request(scope, replay_receive)

    async def call_next(req):
        captured_status = 500
        captured_headers = []
        body_chunks = []

        async def inner_send(msg):
            nonlocal captured_status, captured_headers
            if msg["type"] == "http.response.start":
                captured_status = msg["status"]
                captured_headers = list(msg.get("headers", []))
            elif msg["type"] == "http.response.body":
                body_chunks.append(msg.get("body", b""))

        inner_sent = False

        async def inner_receive():
            nonlocal inner_sent
            if not inner_sent:
                inner_sent = True
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(scope, inner_receive, inner_send)
        resp = Response(content=b"".join(body_chunks), status_code=captured_status)
        if captured_headers:
            resp.raw_headers = captured_headers
        return resp

    response = await self.dispatch(request, call_next)
    await response(scope, receive, send)


def _asgi_request(method: str, path: str, body: dict | None = None, headers: dict | None = None):
    """Execute a full ASGI HTTP call through FastAPI `app` without opening OS sockets."""
    raw_headers = [(b"host", b"testserver")]
    payload_bytes = b""
    if body is not None:
        payload_bytes = json.dumps(body).encode("utf-8")
        raw_headers.append((b"content-type", b"application/json"))
    if headers:
        for k, v in headers.items():
            raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
    }

    sent = False
    messages = []

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": payload_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    with patch.object(BaseHTTPMiddleware, "__call__", _direct_base_middleware_call):
        _drive_coro(app(scope, receive, send))

    start_msg = next(m for m in messages if m["type"] == "http.response.start")
    body_bytes = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    resp_headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in start_msg.get("headers", [])}
    parsed = None
    if body_bytes:
        try:
            parsed = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            parsed = body_bytes.decode("utf-8", errors="replace")
    return start_msg["status"], resp_headers, parsed


class _FakeResult:
    def __init__(self, rows=None, scalar_val=None):
        self._rows = rows or []
        self._scalar = scalar_val

    def scalar(self):
        return self._scalar if self._scalar is not None else (self._rows[0] if self._rows else None)

    def scalar_one(self):
        if not self._rows:
            raise LookupError("No row found for scalar_one()")
        return self._rows[0]

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)

    def scalars(self):
        class _Scalars:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return list(self._rows)

            def first(self):
                return self._rows[0] if self._rows else None

        return _Scalars(self._rows)


class InMemoryStateStore:
    def __init__(self):
        self.users: dict[uuid.UUID, User] = {}
        self.responders: dict[uuid.UUID, ResponderProfile] = {}
        self.reports: dict[uuid.UUID, Report] = {}
        self.incidents: dict[uuid.UUID, Incident] = {}
        self.assignments: dict[uuid.UUID, Assignment] = {}
        self.audit_logs: list[AuditLog] = []
        self.outbox_events: list[OutboxEvent] = []
        self.operating_areas: list[OperatingArea] = []

    def add_user(self, email: str, password: str, role: str, full_name: str, approved: bool = True) -> User:
        u = User(
            id=uuid.uuid4(),
            email=email,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            role=role,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        if role == "responder":
            prof = ResponderProfile(
                id=uuid.uuid4(),
                user_id=u.id,
                unit_code=f"U-{len(self.responders) + 1}",
                display_name=full_name,
                responder_type="fire_warden",
                capabilities=["firefighting", "rescue", "first_aid"],
                is_on_duty=True,
                availability_status="available",
                share_location=True,
                is_approved=approved,
                last_known_location=from_shape(Point(77.4126, 23.2599), srid=4326),
                created_at=datetime.utcnow(),
            )
            prof.user = u
            u.responder_profile = prof
            self.responders[prof.id] = prof
        self.users[u.id] = u
        return u


class InMemoryAsyncSession:
    def __init__(self, store: InMemoryStateStore):
        self.store = store

    def add(self, obj):
        now = datetime.utcnow()
        if isinstance(obj, User):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            obj.updated_at = getattr(obj, "updated_at", None) or now
            self.store.users[obj.id] = obj
            prof = getattr(obj, "responder_profile", None)
            if prof is not None:
                prof.id = prof.id or uuid.uuid4()
                prof.user_id = obj.id
                prof.created_at = getattr(prof, "created_at", None) or now
                self.store.responders[prof.id] = prof
        elif isinstance(obj, ResponderProfile):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            self.store.responders[obj.id] = obj
            if obj.user_id in self.store.users:
                obj.user = self.store.users[obj.user_id]
                obj.user.responder_profile = obj
        elif isinstance(obj, Report):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            self.store.reports[obj.id] = obj
        elif isinstance(obj, Incident):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            obj.updated_at = getattr(obj, "updated_at", None) or now
            self.store.incidents[obj.id] = obj
        elif isinstance(obj, Assignment):
            obj.id = obj.id or uuid.uuid4()
            obj.offered_at = getattr(obj, "offered_at", None) or now
            self.store.assignments[obj.id] = obj
        elif isinstance(obj, AuditLog):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            self.store.audit_logs.append(obj)
        elif isinstance(obj, OutboxEvent):
            obj.id = obj.id or uuid.uuid4()
            obj.created_at = getattr(obj, "created_at", None) or now
            self.store.outbox_events.append(obj)

    async def flush(self):
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def refresh(self, obj):
        return None

    async def execute(self, stmt, *args, **kwargs):
        stmt_text = str(stmt).lower()
        if "postgis_version" in stmt_text:
            raise ConnectionError("PostgreSQL not running in unit sandbox")

        cols = getattr(stmt, "column_descriptions", None) or []
        first_col = cols[0] if cols else {}
        entity = first_col.get("entity")
        is_count = first_col.get("name") == "count"

        compiled = stmt.compile()
        params = compiled.params

        if is_count:
            if "from incidents" in stmt_text:
                if "reported" in stmt_text and "under_review" in stmt_text:
                    cnt = sum(1 for i in self.store.incidents.values() if i.status in {"reported", "under_review", "confirmed", "assigned", "en_route", "on_scene"})
                    return _FakeResult(scalar_val=cnt)
                if "resolved" in stmt_text and "closed" in stmt_text:
                    cnt = sum(1 for i in self.store.incidents.values() if i.status in {"resolved", "closed"})
                    return _FakeResult(scalar_val=cnt)
                if "unverified" in stmt_text:
                    cnt = sum(1 for i in self.store.incidents.values() if i.status in {"unverified", "cancelled"})
                    return _FakeResult(scalar_val=cnt)
                return _FakeResult(scalar_val=len(self.store.incidents))
            if "from reports" in stmt_text:
                return _FakeResult(scalar_val=len(self.store.reports))
            if "from responder_profiles" in stmt_text:
                cnt = sum(1 for r in self.store.responders.values() if r.is_on_duty and r.is_approved)
                return _FakeResult(scalar_val=cnt)

        if entity is User:
            email_val = next((v for k, v in params.items() if "email" in k and isinstance(v, str)), None)
            id_val = next((v for k, v in params.items() if "id" in k), None)
            if email_val is not None:
                found = [u for u in self.store.users.values() if u.email == email_val]
                return _FakeResult(rows=found)
            if id_val is not None:
                uid = uuid.UUID(str(id_val))
                u = self.store.users.get(uid)
                return _FakeResult(rows=[u] if u else [])
            return _FakeResult(rows=list(self.store.users.values()))

        if entity is ResponderProfile:
            uid_val = next((v for k, v in params.items() if "user_id" in k), None)
            rid_val = next((v for k, v in params.items() if k.startswith("id")), None)
            if uid_val is not None:
                uid = uuid.UUID(str(uid_val))
                found = [r for r in self.store.responders.values() if r.user_id == uid]
                return _FakeResult(rows=found)
            if rid_val is not None:
                rid = uuid.UUID(str(rid_val))
                r = self.store.responders.get(rid)
                return _FakeResult(rows=[r] if r else [])
            return _FakeResult(rows=list(self.store.responders.values()))

        if entity is Report:
            idem = next((v for k, v in params.items() if "idempotency" in k), None)
            if idem is not None:
                found = [r for r in self.store.reports.values() if r.idempotency_key == idem]
                return _FakeResult(rows=found)
            rid_val = next((v for k, v in params.items() if k.startswith("id")), None)
            if rid_val is not None:
                rid = uuid.UUID(str(rid_val))
                r = self.store.reports.get(rid)
                return _FakeResult(rows=[r] if r else [])
            return _FakeResult(rows=list(self.store.reports.values()))

        if entity is Incident:
            inc_id = next((v for k, v in params.items() if k.startswith("id")), None)
            if inc_id is not None:
                iid = uuid.UUID(str(inc_id))
                inc = self.store.incidents.get(iid)
                return _FakeResult(rows=[inc] if inc else [])
            return _FakeResult(rows=list(self.store.incidents.values()))

        if entity is Assignment:
            aid_val = next((v for k, v in params.items() if k.startswith("id")), None)
            if aid_val is not None:
                aid = uuid.UUID(str(aid_val))
                a = self.store.assignments.get(aid)
                return _FakeResult(rows=[a] if a else [])
            if "arrived" in stmt_text and "completed" in stmt_text:
                rows = [a for a in self.store.assignments.values() if a.status in {"arrived", "completed"} and a.completed_at is not None]
                return _FakeResult(rows=rows)
            return _FakeResult(rows=list(self.store.assignments.values()))

        if entity is AuditLog:
            return _FakeResult(rows=list(self.store.audit_logs))

        if entity is OperatingArea:
            return _FakeResult(rows=list(self.store.operating_areas))

        return _FakeResult(rows=[])


class _FailingRedis:
    """Force deterministic in-memory fallbacks with zero OS socket wait."""
    async def get(self, *args, **kwargs):
        raise ConnectionError("Redis offline")

    async def setex(self, *args, **kwargs):
        raise ConnectionError("Redis offline")

    async def delete(self, *args, **kwargs):
        raise ConnectionError("Redis offline")

    async def publish(self, *args, **kwargs):
        raise ConnectionError("Redis offline")

    def pipeline(self):
        raise ConnectionError("Redis offline")

    async def close(self):
        return None


class _FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.client_state = WebSocketState.CONNECTING
        self.sent_json = []

    async def accept(self):
        self.accepted = True
        self.client_state = WebSocketState.CONNECTED

    async def send_text(self, payload: str):
        self.sent_json.append(json.loads(payload))


def test_asgi_middleware_health_and_validation_contracts():
    store = InMemoryStateStore()
    session = InMemoryAsyncSession(store)

    async def _override_db():
        yield session

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("app.api.v1.endpoints.health.aioredis.from_url", return_value=_FailingRedis()):
            code, hdrs, data = _asgi_request("GET", "/api/v1/health")
        assert code == 200
        assert "x-request-id" in hdrs
        assert hdrs["x-process-time"].endswith("ms")
        assert data["api"] == "online"
        assert data["status"] == "degraded"  # Postgres/Redis offline accurately reported

        # Unauthenticated operator access blocked by JWT dependency
        unauth_code, _, unauth_body = _asgi_request("GET", "/api/v1/operator/incidents")
        assert unauth_code == 401
        assert unauth_body["code"] == "UNAUTHORIZED"

        # Validation error envelope via FastAPI RequestValidationError handler
        op = store.add_user("op@resqai.in", "Pass@1234", "operator", "Ops Lead")
        _, _, login_res = _asgi_request("POST", "/api/v1/auth/login", {"email": op.email, "password": "Pass@1234"})
        op_token = login_res["access_token"]
        bad_code, _, bad_body = _asgi_request(
            "POST",
            "/api/v1/citizen/sos",
            {"location": {"lat": 250.0, "lng": 77.4}},
            headers={"Authorization": f"Bearer {op_token}"},
        )
        assert bad_code == 422
        assert bad_body["code"] == "VALIDATION_ERROR"
    finally:
        app.dependency_overrides.clear()
        _in_memory_blacklist.clear()
        _in_memory_refresh_tokens.clear()


def test_asgi_auth_lifecycle_token_revocation_and_rbac_boundaries():
    store = InMemoryStateStore()
    session = InMemoryAsyncSession(store)

    async def _override_db():
        yield session

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("app.core.redis.get_redis_client", return_value=_FailingRedis()),
            patch("app.core.token_store.get_redis_client", return_value=_FailingRedis()),
            patch("app.modules.admin.service.get_redis_client", return_value=_FailingRedis()),
        ):
            # 1. Operator/Admin self-registration disallowed
            bad_reg_code, _, bad_reg_body = _asgi_request(
                "POST",
                "/api/v1/auth/register",
                {"email": "rogue@resqai.in", "password": "Password123!", "full_name": "Rogue", "role": "operator"},
            )
            assert bad_reg_code == 400
            assert bad_reg_body["code"] == "INVALID_ROLE"

            # 2. Citizen registration -> 201 + /me works
            cit_code, _, cit_data = _asgi_request(
                "POST",
                "/api/v1/auth/register",
                {"email": "meera@bhopal.in", "password": "Password123!", "name": "Meera Citizen", "role": "citizen"},
            )
            assert cit_code == 201
            cit_access = cit_data["accessToken"]
            cit_refresh = cit_data["refreshToken"]

            me_code, _, me_data = _asgi_request("GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {cit_access}"})
            assert me_code == 200
            assert me_data["role"] == "citizen"

            # 3. Citizen blocked from operator & admin endpoints (HTTP 403)
            op_block_code, _, _ = _asgi_request("GET", "/api/v1/operator/reports/queue", headers={"Authorization": f"Bearer {cit_access}"})
            assert op_block_code == 403

            adm_block_code, _, _ = _asgi_request("GET", "/api/v1/admin/responders", headers={"Authorization": f"Bearer {cit_access}"})
            assert adm_block_code == 403

            # 4. Unapproved responder blocked until admin vetting
            resp_code, _, resp_reg = _asgi_request(
                "POST",
                "/api/v1/auth/register",
                {"email": "newresp@bhopal.in", "password": "Password123!", "name": "Pending Unit", "role": "responder"},
            )
            assert resp_code == 201
            pending_code, _, pending_err = _asgi_request(
                "GET",
                "/api/v1/responder/assignments",
                headers={"Authorization": f"Bearer {resp_reg['accessToken']}"},
            )
            assert pending_code == 403
            assert "pending administrator approval" in pending_err["message"].lower()

            # 5. Refresh rotation revokes previous refresh token + logout blacklists access token
            ref_code, _, rotated = _asgi_request("POST", "/api/v1/auth/refresh", {"refreshToken": cit_refresh})
            assert ref_code == 200
            assert rotated["refreshToken"] != cit_refresh

            reuse_code, _, _ = _asgi_request("POST", "/api/v1/auth/refresh", {"refreshToken": cit_refresh})
            assert reuse_code == 401

            out_code, _, _ = _asgi_request("POST", "/api/v1/auth/logout", headers={"Authorization": f"Bearer {rotated['accessToken']}"})
            assert out_code == 200
            after_out_code, _, after_out_body = _asgi_request("GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {rotated['accessToken']}"})
            assert after_out_code == 401
            assert "revoked" in after_out_body["message"].lower()
    finally:
        app.dependency_overrides.clear()
        _in_memory_blacklist.clear()
        _in_memory_refresh_tokens.clear()


def test_asgi_cross_module_dispatch_realtime_isolation_and_analytics():
    store = InMemoryStateStore()
    session = InMemoryAsyncSession(store)
    citizen_a = store.add_user("cit-a@bhopal.in", "Pass@1234", "citizen", "Citizen A")
    citizen_b = store.add_user("cit-b@bhopal.in", "Pass@1234", "citizen", "Citizen B")
    operator = store.add_user("op-cmd@bhopal.in", "Pass@1234", "operator", "Command Op")
    resp_user = store.add_user("resp-f2@bhopal.in", "Pass@1234", "responder", "Fire Unit F-2", approved=True)

    # Seed incident tied to Citizen A's area
    inc = Incident(
        id=uuid.uuid4(),
        public_code="INC-701",
        category="fire_smoke",
        urgency="high",
        status="confirmed",
        title="MP Nagar Smoke Plume",
        location=from_shape(Point(77.4343, 23.2332), srid=4326),
        location_label="MP Nagar Zone-I, Bhopal",
        evidence_label="corroborated",
        hide_precise_location=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    store.incidents[inc.id] = inc

    async def _override_db():
        yield session

    ws_op = _FakeWebSocket()
    ws_cit_a = _FakeWebSocket()
    ws_cit_b = _FakeWebSocket()

    app.dependency_overrides[get_db] = _override_db
    try:
        with (
            patch("app.core.redis.get_redis_client", return_value=_FailingRedis()),
            patch("app.core.token_store.get_redis_client", return_value=_FailingRedis()),
            patch("app.modules.admin.service.get_redis_client", return_value=_FailingRedis()),
            patch("app.modules.realtime.publisher.get_redis_client", return_value=_FailingRedis()),
            patch.object(connection_manager, "_ensure_redis_listener", return_value=None),
        ):
            # Connect WebSockets to real ConnectionManager rooms
            _drive_coro(connection_manager.connect(ws_op, operator))
            _drive_coro(connection_manager.connect(ws_cit_a, citizen_a))
            _drive_coro(connection_manager.connect(ws_cit_b, citizen_b))

            _, _, op_login = _asgi_request("POST", "/api/v1/auth/login", {"email": operator.email, "password": "Pass@1234"})
            _, _, resp_login = _asgi_request("POST", "/api/v1/auth/login", {"email": resp_user.email, "password": "Pass@1234"})
            op_hdrs = {"Authorization": f"Bearer {op_login['accessToken']}"}
            resp_hdrs = {"Authorization": f"Bearer {resp_login['accessToken']}"}

            # 1. Operator overrides urgency -> dispatches approved responder F-2
            ovr_code, _, ovr_data = _asgi_request(
                "POST",
                "/api/v1/operator/actions/override",
                {"incidentId": str(inc.id), "urgency": "critical", "reason": "Confirmed electrical blaze"},
                headers=op_hdrs,
            )
            assert ovr_code == 200
            assert ovr_data["urgency"] == "critical"

            disp_code, _, disp_data = _asgi_request(
                "POST",
                "/api/v1/operator/actions/dispatch",
                {"incidentId": str(inc.id), "responderId": str(resp_user.responder_profile.id), "note": "Respond code 3"},
                headers=op_hdrs,
            )
            assert disp_code == 201
            assignment_id = disp_data["id"]

            # 2. Responder accepts offer -> location ping -> en_route -> arrived -> completed
            acc_code, _, acc_data = _asgi_request(
                "POST",
                f"/api/v1/responder/offers/{assignment_id}/respond",
                {"status": "accepted"},
                headers=resp_hdrs,
            )
            assert acc_code == 200
            assert acc_data["status"] == "accepted"

            ping_code, _, _ = _asgi_request(
                "POST",
                "/api/v1/responder/location",
                {"lat": 23.2400, "lng": 77.4250},
                headers=resp_hdrs,
            )
            assert ping_code == 200

            for st in ["en_route", "arrived", "completed"]:
                st_code, _, st_data = _asgi_request(
                    "POST",
                    f"/api/v1/responder/assignments/{assignment_id}/status",
                    {"status": st, "reason": f"Transition to {st}"},
                    headers=resp_hdrs,
                )
                assert st_code == 200
                assert st_data["status"] == st

            # 3. Verify analytics summary reflects 1 completed/resolved incident
            ana_code, _, ana_data = _asgi_request("GET", "/api/v1/analytics/summary", headers=op_hdrs)
            assert ana_code == 200
            assert ana_data["totalIncidents"] == 1
            assert ana_data["resolvedIncidents"] == 1
            assert ana_data["activeRespondersCount"] == 1

            # 4. Outbox realtime broadcast isolation: Citizen A report event reaches Operator & Citizen A, NEVER Citizen B
            cit_a_event = OutboxEvent(
                id=uuid.uuid4(),
                aggregate_type="report",
                aggregate_id=uuid.uuid4(),
                event_type="OUTBOX_SOS_CREATED",
                payload={"reporter_id": str(citizen_a.id), "category": "personal_safety", "lat": 23.2599, "lng": 77.4126},
                created_at=datetime.utcnow(),
            )
            delivered = _drive_coro(broadcast_outbox_event(cit_a_event))
            assert delivered >= 2
            assert any(m["type"] == "report.received" for m in ws_op.sent_json)
            assert any(m["type"] == "report.received" for m in ws_cit_a.sent_json)
            assert all(m.get("payload", {}).get("reporter_id") != str(citizen_a.id) for m in ws_cit_b.sent_json)

            # Audit log captured override + dispatch
            audit_actions = {a.action for a in store.audit_logs}
            assert "OVERRIDE_AI" in audit_actions
            assert "DISPATCH_OFFER" in audit_actions
    finally:
        _drive_coro(connection_manager.disconnect(ws_op))
        _drive_coro(connection_manager.disconnect(ws_cit_a))
        _drive_coro(connection_manager.disconnect(ws_cit_b))
        app.dependency_overrides.clear()
        _in_memory_blacklist.clear()
        _in_memory_refresh_tokens.clear()
