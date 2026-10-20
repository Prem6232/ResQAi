import json
import logging
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timezone
from app.models.outbox import OutboxEvent
from app.core.redis import get_redis_client
from app.modules.realtime.connection_manager import connection_manager

logger = logging.getLogger("sentinelgrid.realtime.publisher")

# Public broadcast event types received by all users on campus
PUBLIC_EVENT_TYPES = {
    "alert.broadcast",
    "campus.evacuation",
    "incident.critical_alert"
}

def format_outbox_envelope(event: OutboxEvent) -> Dict[str, Any]:
    """
    Format OutboxEvent into frontend-compatible WsEvent envelope:
    {
      "id": str,
      "type": str,
      "occurredAt": str (ISO 8601 UTC),
      "incidentId": Optional[str],
      "payload": dict
    }
    """
    payload = event.payload if isinstance(event.payload, dict) else {}
    
    # Normalize event type for frontend compatibility
    ev_type = event.event_type
    if ev_type in ["report.created", "citizen.report_submitted", "OUTBOX_SOS_CREATED"]:
        ev_type = "report.received"

    # Extract incident identifier if available
    incident_id = None
    if "incident_id" in payload and payload["incident_id"]:
        incident_id = str(payload["incident_id"])
    elif "incidentId" in payload and payload["incidentId"]:
        incident_id = str(payload["incidentId"])

    occurred_at = (
        event.created_at.replace(tzinfo=timezone.utc).isoformat()
        if event.created_at
        else datetime.now(timezone.utc).isoformat()
    )

    return {
        "id": str(event.id),
        "type": ev_type,
        "occurredAt": occurred_at,
        "incidentId": incident_id,
        "payload": payload,
    }

def get_target_channels_for_event(event: OutboxEvent) -> Tuple[List[str], List[str]]:
    """
    Determine recipient channel list and corresponding Redis Pub/Sub channels.
    Enforces strict role-based isolation: Citizens NEVER receive operator events.
    """
    payload = event.payload if isinstance(event.payload, dict) else {}
    internal_channels: List[str] = []
    redis_channels: List[str] = []

    # 1. Operators & Admins receive all operational and dispatch events
    internal_channels.append("operator:all")
    redis_channels.append("sentinelgrid:ws:operator")

    # 2. Responders receive mission offers, updates, and telemetry
    if event.event_type.startswith("assignment.") or "responder_id" in payload:
        responder_id = payload.get("responder_id")
        if responder_id:
            resp_str = str(responder_id)
            internal_channels.append(f"responder:{resp_str}")
            redis_channels.append(f"sentinelgrid:ws:responder:{resp_str}")
        else:
            internal_channels.append("responder:all")
            redis_channels.append("sentinelgrid:ws:responder:all")


    # 3. Citizens receive receipts and updates strictly for their own submitted reports
    reporter_id = payload.get("reporter_id") or payload.get("user_id")
    if reporter_id:
        rep_str = str(reporter_id)
        internal_channels.append(f"citizen:{rep_str}")
        redis_channels.append(f"sentinelgrid:ws:citizen:{rep_str}")

    # 4. Public events broadcast to everyone
    if event.event_type in PUBLIC_EVENT_TYPES or payload.get("broadcast_public", False):
        internal_channels.append("public:all")
        redis_channels.append("sentinelgrid:ws:public")

    return list(set(internal_channels)), list(set(redis_channels))

async def broadcast_outbox_event(event: OutboxEvent) -> int:
    """
    Publish outbox event to connected local WebSocket clients and Redis Pub/Sub.
    Returns total local clients delivered to.
    """
    try:
        envelope = format_outbox_envelope(event)
        internal_channels, redis_channels = get_target_channels_for_event(event)

        # 1. Direct local fanout for low-latency delivery (< 100ms)
        dispatched_count = await connection_manager.broadcast_to_channels(
            target_channels=internal_channels,
            envelope=envelope
        )

        # 2. Multi-process Redis Pub/Sub publish
        try:
            r = get_redis_client()
            envelope_str = json.dumps(envelope)
            for r_ch in redis_channels:
                await r.publish(r_ch, envelope_str)
        except Exception as redis_err:
            logger.warning(f"Redis pubsub publish warning: {redis_err}")

        logger.debug(f"Broadcasted outbox event {event.id} ({event.event_type}) to {dispatched_count} local client(s)")
        return dispatched_count

    except Exception as e:
        logger.error(f"Error in broadcast_outbox_event: {e}", exc_info=True)
        return 0
