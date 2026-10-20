import pytest
import asyncio
import uuid
import json
import contextlib
from datetime import datetime, timedelta, timezone
import httpx
from httpx_ws import aconnect_ws, WebSocketDisconnect
from httpx_ws.transport import ASGIWebSocketTransport
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import status

from app.main import app
from app.models.entities import User, OutboxEvent, Incident, Report
from app.core.outbox import create_outbox_event
from app.modules.realtime.publisher import broadcast_outbox_event
from app.ai.celery_tasks import async_relay_outbox_events


@contextlib.asynccontextmanager
async def create_ws_client():
    async with ASGIWebSocketTransport(app=app) as transport:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


async def get_token_for(client: httpx.AsyncClient, email: str) -> str:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "demo1234"}
    )
    assert login_resp.status_code == status.HTTP_200_OK
    return login_resp.json()["access_token"]

@pytest.mark.asyncio
async def test_websocket_unauthenticated_rejected():
    """
    Unauthenticated connections (missing, bogus, or revoked tokens)
    must be immediately rejected with WebSocket close code 4001.
    """
    async with create_ws_client() as ws_client:
        # 1. Missing token
        with pytest.raises(WebSocketDisconnect) as exc_missing:
            async with aconnect_ws("/ws", ws_client):
                pass
        assert exc_missing.value.code == 4001

        # 2. Bogus / tampered token
        with pytest.raises(WebSocketDisconnect) as exc_bogus:
            async with aconnect_ws("/ws?token=bogus.jwt.token", ws_client):
                pass
        assert exc_bogus.value.code == 4001

        # 3. Mount at /api/v1/ws also rejects with 4001
        with pytest.raises(WebSocketDisconnect) as exc_api_v1:
            async with aconnect_ws("/api/v1/ws", ws_client):
                pass
        assert exc_api_v1.value.code == 4001

@pytest.mark.asyncio
async def test_websocket_handshake_all_roles():
    """
    Verify operator, responder, and citizen can successfully connect
    and exchange ping/pong keepalive frames.
    """
    roles = [
        "operator@campus.demo",
        "responder@campus.demo",
        "citizen@campus.demo"
    ]

    async with create_ws_client() as ws_client:
        for email in roles:
            token = await get_token_for(ws_client, email)

            # Connect to /ws
            async with aconnect_ws(f"/ws?token={token}", ws_client) as ws:
                # Plain string ping
                await ws.send_text("ping")
                reply = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
                assert reply == "pong"

                # JSON ping
                await ws.send_text(json.dumps({"type": "ping"}))
                json_reply = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=2.0))
                assert json_reply.get("type") == "pong"

@pytest.mark.asyncio
async def test_operator_receives_sos_realtime(
    db_session: AsyncSession
):
    """
    Operator socket receives new SOS event in under 2 seconds.
    Verified envelope schema: id, type, occurredAt, incidentId, payload.
    """
    # Drain any existing pending outbox events from earlier tests
    while await async_relay_outbox_events(batch_size=100) > 0:
        pass

    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")
        cit_token = await get_token_for(ws_client, "citizen@campus.demo")

        async with aconnect_ws(f"/ws?token={op_token}", ws_client) as op_ws:
            # Drain any prior lingering messages on operator socket
            while True:
                try:
                    await asyncio.wait_for(op_ws.receive_text(), timeout=0.1)
                except asyncio.TimeoutError:
                    break

            # Citizen submits emergency SOS
            sos_key = f"ws_sos_{uuid.uuid4().hex}"
            sos_resp = await ws_client.post(
                "/api/v1/citizen/sos",
                json={
                    "location": {"lat": 28.5490, "lng": 77.2790},
                    "locationLabel": "East Gate",
                    "idempotencyKey": sos_key
                },
                headers={"Authorization": f"Bearer {cit_token}"}
            )
            assert sos_resp.status_code == status.HTTP_201_CREATED

            # Relay processes outbox event and broadcasts to WebSockets
            processed = await async_relay_outbox_events(batch_size=50)
            assert processed > 0

            # Operator receives real-time notification matching our SOS
            found = False
            for _ in range(25):
                try:
                    raw_msg = await asyncio.wait_for(op_ws.receive_text(), timeout=2.0)
                    event = json.loads(raw_msg)
                    if (
                        event.get("type") in ["report.received", "report.created", "OUTBOX_SOS_CREATED"]
                        and event.get("payload", {}).get("channel") == "sos"
                    ):
                        assert "id" in event
                        assert "occurredAt" in event
                        assert "payload" in event
                        found = True
                        break
                except asyncio.TimeoutError:
                    break

            assert found, "Operator socket never received the broadcast SOS event"


@pytest.mark.asyncio
async def test_channel_isolation_citizens_never_receive_operator_events(
    db_session: AsyncSession
):
    """
    Strict Channel Isolation:
    Operators receive command/dispatch events; citizens NEVER receive operator events.
    """
    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")
        cit_token = await get_token_for(ws_client, "citizen@campus.demo")

        async with aconnect_ws(f"/ws?token={op_token}", ws_client) as op_ws:
            async with aconnect_ws(f"/ws?token={cit_token}", ws_client) as cit_ws:

                # Create an operator-only incident state update event
                inc_id = uuid.uuid4()
                ev = await create_outbox_event(
                    session=db_session,
                    aggregate_type="Incident",
                    aggregate_id=inc_id,
                    event_type="incident.updated",
                    payload={
                        "incident_id": str(inc_id),
                        "from_status": "under_review",
                        "to_status": "confirmed",
                        "operator_internal_note": "Confidential tactical briefing"
                    }
                )
                ev.status = "published"
                await db_session.commit()

                # Broadcast event
                await broadcast_outbox_event(ev)

                # 1. Operator receives the update
                found_op = False
                for _ in range(5):
                    raw = await asyncio.wait_for(op_ws.receive_text(), timeout=2.0)
                    op_msg = json.loads(raw)
                    if op_msg.get("type") == "incident.updated" and op_msg.get("incidentId") == str(inc_id):
                        found_op = True
                        break
                assert found_op, "Operator socket never received incident.updated"

                # 2. Citizen socket receives NOTHING matching the internal event
                # Any message citizen receives must not be incident.updated for inc_id
                while True:
                    try:
                        cit_raw = await asyncio.wait_for(cit_ws.receive_text(), timeout=0.3)
                        cit_msg = json.loads(cit_raw)
                        assert cit_msg.get("incidentId") != str(inc_id)
                    except asyncio.TimeoutError:
                        break

@pytest.mark.asyncio
async def test_responder_private_channel_isolation(
    db_session: AsyncSession
):
    """
    Targeted mission offers are delivered to the recipient responder's private channel.
    Unrelated responder units do NOT receive the private offer.
    """
    async with create_ws_client() as ws_client:
        f2_token = await get_token_for(ws_client, "responder@campus.demo") # Unit F-2
        p07_token = await get_token_for(ws_client, "patrol07@campus.demo") # Unit P-07

        # Get F-2's responder profile ID
        f2_me = (await ws_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {f2_token}"})).json()
        f2_profile_id = f2_me["responder_profile"]["id"]

        async with aconnect_ws(f"/ws?token={f2_token}", ws_client) as f2_ws:
            async with aconnect_ws(f"/ws?token={p07_token}", ws_client) as p07_ws:

                asg_id = uuid.uuid4()
                inc_id = uuid.uuid4()
                ev = await create_outbox_event(
                    session=db_session,
                    aggregate_type="Assignment",
                    aggregate_id=asg_id,
                    event_type="assignment.offered",
                    payload={
                        "assignment_id": str(asg_id),
                        "incident_id": str(inc_id),
                        "responder_id": f2_profile_id,
                        "unit_code": "F-2",
                        "eta_minutes": 3,
                    }
                )
                ev.status = "published"
                await db_session.commit()

                # Broadcast targeted offer
                await broadcast_outbox_event(ev)

                # 1. Unit F-2 receives the private offer
                found_f2 = False
                for _ in range(5):
                    raw = await asyncio.wait_for(f2_ws.receive_text(), timeout=2.0)
                    f2_msg = json.loads(raw)
                    if f2_msg.get("type") == "assignment.offered" and f2_msg.get("payload", {}).get("unit_code") == "F-2":
                        found_f2 = True
                        break
                assert found_f2, "F-2 socket did not receive targeted offer"

                # 2. Unit P-07 does NOT receive F-2's offer
                while True:
                    try:
                        p07_raw = await asyncio.wait_for(p07_ws.receive_text(), timeout=0.3)
                        p07_msg = json.loads(p07_raw)
                        assert p07_msg.get("type") != "assignment.offered" or p07_msg.get("payload", {}).get("unit_code") != "F-2"
                    except asyncio.TimeoutError:
                        break

@pytest.mark.asyncio
async def test_reconnection_and_historical_replay(
    db_session: AsyncSession
):
    """
    Clients reconnecting with ?since=... receive missed published events in chronological order.
    """
    async with create_ws_client() as ws_client:
        op_token = await get_token_for(ws_client, "operator@campus.demo")

        now = datetime.utcnow()
        # Use future timestamps for ev1 and ev2 to isolate them from any previously published events in the DB
        t_base = now + timedelta(minutes=5)
        t_ev1 = t_base + timedelta(seconds=1)
        t_ev2 = t_base + timedelta(seconds=2)

        ev1_id = uuid.uuid4()
        ev1 = OutboxEvent(
            id=ev1_id,
            aggregate_type="Incident",
            aggregate_id=uuid.uuid4(),
            event_type="incident.updated",
            payload={"incident_id": str(ev1_id), "note": "Replay Event 1 (Earlier)"},
            status="published",
            created_at=t_ev1,
            processed_at=t_ev1
        )
        ev2_id = uuid.uuid4()
        ev2 = OutboxEvent(
            id=ev2_id,
            aggregate_type="Incident",
            aggregate_id=uuid.uuid4(),
            event_type="incident.updated",
            payload={"incident_id": str(ev2_id), "note": "Replay Event 2 (Later)"},
            status="published",
            created_at=t_ev2,
            processed_at=t_ev2
        )
        db_session.add_all([ev1, ev2])
        await db_session.commit()

        # Reconnect with since timestamp between t_base and t_ev1
        since_ts = t_base.replace(tzinfo=timezone.utc).isoformat()
        async with aconnect_ws(f"/ws?token={op_token}&since={since_ts}", ws_client) as ws:
            # Replay must deliver ev1 first, then ev2 (chronological order)
            msg1 = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=2.0))
            msg2 = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=2.0))

            assert msg1["id"] == str(ev1_id)
            assert msg2["id"] == str(ev2_id)

