import json
import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.security import decode_jwt_token
from app.core.token_store import is_token_blacklisted
from app.models.entities import User, ResponderProfile
from app.models.outbox import OutboxEvent
from app.modules.realtime.connection_manager import connection_manager
from app.modules.realtime.publisher import format_outbox_envelope, get_target_channels_for_event

logger = logging.getLogger("sentinelgrid.realtime.router")

realtime_router = APIRouter()

async def authenticate_websocket(token: Optional[str]) -> Optional[User]:
    """
    Validate JWT access token from WebSocket handshake query string.
    Returns User entity with eager loaded responder_profile, or None if invalid.
    """
    if not token:
        return None

    try:
        payload = decode_jwt_token(token)
    except Exception as e:
        logger.warning(f"WebSocket auth failed: token decode error: {e}")
        return None

    if payload.get("type") != "access":
        logger.warning("WebSocket auth failed: token is not an access token")
        return None

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        logger.warning("WebSocket auth failed: token is blacklisted/revoked")
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    async with AsyncSessionLocal() as db:
        stmt = (
            select(User)
            .options(selectinload(User.responder_profile))
            .where(User.id == user_id, User.is_active == True)
        )
        user = (await db.execute(stmt)).scalar_one_or_none()
        return user

async def replay_missed_events(
    websocket: WebSocket,
    channels: set[str],
    since_str: str
) -> int:
    """
    Replay missed outbox events from the specified timestamp to the newly connected client.
    Enforces channel and role permissions in chronological order.
    """
    try:
        clean_since = since_str.replace(" ", "+").replace("Z", "+00:00")
        since_dt = datetime.fromisoformat(clean_since)
        if since_dt.tzinfo is not None:
            since_dt = since_dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception as e:
        logger.warning(f"Invalid 'since' timestamp format '{since_str}': {e}")
        return 0

    replayed_count = 0
    async with AsyncSessionLocal() as db:
        stmt = (
            select(OutboxEvent)
            .where(
                OutboxEvent.status == "published",
                OutboxEvent.created_at >= since_dt
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(100)
        )
        events = (await db.execute(stmt)).scalars().all()

        for ev in events:
            internal_channels, _ = get_target_channels_for_event(ev)
            if not channels.isdisjoint(set(internal_channels)):
                envelope = format_outbox_envelope(ev)
                await websocket.send_text(json.dumps(envelope))
                replayed_count += 1

    logger.info(f"Replayed {replayed_count} missed event(s) since {since_str}")
    return replayed_count

@realtime_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None)
):
    """
    Unified WebSocket gateway for ResQAi / SENTINELGRID.
    - Handshake authenticated via ?token={access_token}.
    - Missing/invalid/revoked token rejected with close code 4001.
    - Role-based channel isolation: 'operator:all', 'responder:{id}', 'citizen:{id}'.
    - Reconnection support with ?since={iso_timestamp} for historical replay.
    """
    user = await authenticate_websocket(token)
    if not user:
        # Reject with 4001 Unauthorized
        await websocket.close(code=4001, reason="Unauthorized")
        return

    responder_id = str(user.responder_profile.id) if user.responder_profile else None

    # Accept connection and assign channel subscriptions
    conn = await connection_manager.connect(
        websocket=websocket,
        user=user,
        responder_id=responder_id
    )

    try:
        # Replay missed events if requested on reconnection
        if since:
            await replay_missed_events(websocket, conn.channels, since)

        # Message pump
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            else:
                try:
                    payload = json.loads(data)
                    if payload.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    pass

    except WebSocketDisconnect:
        await connection_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WebSocket session terminated: {e}")
        await connection_manager.disconnect(websocket)
