import asyncio
import json
import logging
from typing import Set, Dict, Any, List, Optional
from datetime import datetime, timezone
from starlette.websockets import WebSocket, WebSocketState
from app.models.entities import User
from app.core.redis import get_redis_client

logger = logging.getLogger("sentinelgrid.realtime.manager")

class ActiveConnection:
    def __init__(
        self,
        websocket: WebSocket,
        user_id: str,
        role: str,
        channels: Set[str],
        responder_id: Optional[str] = None
    ):
        self.websocket = websocket
        self.user_id = user_id
        self.role = role
        self.channels = channels
        self.responder_id = responder_id
        self.connected_at = datetime.now(timezone.utc)

class ConnectionManager:
    """
    Manages active WebSocket connections, role-based channel memberships,
    and Redis Pub/Sub multi-pod event fanout.
    """
    def __init__(self):
        self._connections: List[ActiveConnection] = []
        self._lock = asyncio.Lock()
        self._redis_task: Optional[asyncio.Task] = None
        self._is_listening_redis = False

    async def connect(
        self,
        websocket: WebSocket,
        user: User,
        responder_id: Optional[str] = None
    ) -> ActiveConnection:
        """
        Accept WebSocket connection and assign authorized channel subscriptions based on user role.
        """
        channels: Set[str] = {"public:all"}

        user_role = user.role.lower()
        user_id_str = str(user.id)

        if user_role in ["operator", "admin"]:
            channels.add("operator:all")
        elif user_role == "responder":
            channels.add("responder:all")
            if responder_id:
                channels.add(f"responder:{responder_id}")
            # Also allow subscription by user_id for responder
            channels.add(f"responder:{user_id_str}")
        elif user_role == "citizen":
            channels.add(f"citizen:{user_id_str}")

        await websocket.accept()

        conn = ActiveConnection(
            websocket=websocket,
            user_id=user_id_str,
            role=user_role,
            channels=channels,
            responder_id=responder_id
        )

        async with self._lock:
            self._connections.append(conn)

        logger.info(f"WebSocket client connected: user={user.email} role={user_role} channels={channels}")

        # Ensure Redis Pub/Sub background listener is running
        self._ensure_redis_listener()

        return conn

    async def disconnect(self, websocket: WebSocket) -> None:
        """Unregister a disconnected WebSocket client."""
        async with self._lock:
            self._connections = [c for c in self._connections if c.websocket != websocket]
        logger.info("WebSocket client disconnected and unregistered")

    async def broadcast_to_channels(
        self,
        target_channels: List[str],
        envelope: Dict[str, Any]
    ) -> int:
        """
        Dispatch message envelope to all connected WebSockets subscribed to any target channel.
        Returns count of clients receiving the message.
        """
        target_set = set(target_channels)
        message_str = json.dumps(envelope)
        dispatched_count = 0
        stale_sockets: List[WebSocket] = []

        async with self._lock:
            for conn in list(self._connections):
                if not conn.channels.isdisjoint(target_set):
                    try:
                        if conn.websocket.client_state == WebSocketState.CONNECTED:
                            await conn.websocket.send_text(message_str)
                            dispatched_count += 1
                        else:
                            stale_sockets.append(conn.websocket)
                    except Exception as e:
                        logger.warning(f"Error sending message to WebSocket client {conn.user_id}: {e}")
                        stale_sockets.append(conn.websocket)

            # Clean up disconnected sockets
            if stale_sockets:
                self._connections = [c for c in self._connections if c.websocket not in stale_sockets]

        return dispatched_count

    def _ensure_redis_listener(self) -> None:
        """Start Redis Pub/Sub background subscriber task if not already running."""
        if not self._is_listening_redis:
            try:
                loop = asyncio.get_running_loop()
                self._redis_task = loop.create_task(self._redis_pubsub_loop())
                self._is_listening_redis = True
            except RuntimeError:
                pass

    async def _redis_pubsub_loop(self) -> None:
        """Listen to Redis Pub/Sub channels and forward incoming events to connected WebSockets."""
        logger.info("Starting Redis Pub/Sub realtime listener")
        while True:
            try:
                r = get_redis_client()
                pubsub = r.pubsub()
                await pubsub.psubscribe("sentinelgrid:ws:*")

                async for msg in pubsub.listen():
                    if msg and msg.get("type") == "pmessage":
                        redis_channel = msg.get("channel", "")
                        raw_data = msg.get("data")
                        if not raw_data or not isinstance(raw_data, str):
                            continue

                        try:
                            envelope = json.loads(raw_data)
                        except Exception:
                            continue

                        # Map redis channel back to internal channel:
                        # sentinelgrid:ws:operator -> operator:all
                        # sentinelgrid:ws:public -> public:all
                        # sentinelgrid:ws:responder:123 -> responder:123
                        # sentinelgrid:ws:citizen:123 -> citizen:123
                        internal_ch = redis_channel.replace("sentinelgrid:ws:", "")
                        if internal_ch == "operator":
                            internal_ch = "operator:all"
                        elif internal_ch == "public":
                            internal_ch = "public:all"

                        await self.broadcast_to_channels([internal_ch], envelope)

            except asyncio.CancelledError:
                logger.info("Redis pubsub listener cancelled")
                break
            except Exception as e:
                logger.warning(f"Redis pubsub listener encountered error, reconnecting in 2s: {e}")
                await asyncio.sleep(2.0)

connection_manager = ConnectionManager()
