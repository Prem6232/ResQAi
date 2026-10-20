import uuid
import asyncio
import logging
from typing import Dict, Any, List
from datetime import datetime
from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.core.outbox import claim_pending_outbox_events, mark_outbox_event_published, mark_outbox_event_failed
from app.ai.pipeline import execute_report_ai_pipeline

logger = logging.getLogger("sentinelgrid.ai.tasks")

async def async_process_report_ai(report_id_str: str) -> Dict[str, Any]:
    """Execute AI pipeline inside an async database session."""
    report_uuid = uuid.UUID(report_id_str)
    async with AsyncSessionLocal() as session:
        try:
            evidence = await execute_report_ai_pipeline(session, report_uuid)
            return evidence.model_dump() if evidence else {}
        except Exception as e:
            logger.error(f"Error in async_process_report_ai for report {report_id_str}: {e}", exc_info=True)
            raise

@celery_app.task(name="app.ai.celery_tasks.process_report_ai_task", bind=True, max_retries=3)
def process_report_ai_task(self, report_id_str: str) -> Dict[str, Any]:
    """Celery task worker invoking AI triage pipeline."""
    try:
        return asyncio.run(async_process_report_ai(report_id_str))
    except Exception as exc:
        logger.error(f"process_report_ai_task failure: {exc}. Retrying...")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

async def async_relay_outbox_events(batch_size: int = 50) -> int:
    """
    Relay worker claiming pending events using FOR UPDATE SKIP LOCKED.
    Dispatches Celery AI tasks for ingested citizen reports and SOS beacons.
    """
    async with AsyncSessionLocal() as session:
        events = await claim_pending_outbox_events(session, batch_size=batch_size)
        processed_count = 0

        for ev in events:
            try:
                if ev.event_type in ["report.created", "OUTBOX_SOS_CREATED", "citizen.report_submitted", "citizen.sos_created"]:
                    try:
                        await async_process_report_ai(str(ev.aggregate_id))
                    except Exception as pipe_err:
                        logger.warning(f"AI processing during relay failed: {pipe_err}")

                ev.status = "published"
                ev.processed_at = datetime.utcnow()
                processed_count += 1

                # Broadcast to realtime WebSocket and Redis pub/sub
                try:
                    from app.modules.realtime import broadcast_outbox_event
                    await broadcast_outbox_event(ev)
                except Exception as b_err:
                    logger.warning(f"Realtime broadcast for outbox event {ev.id} failed: {b_err}")
            except Exception as e:
                logger.error(f"Relay error processing outbox event {ev.id}: {e}", exc_info=True)
                ev.retry_count += 1
                if ev.retry_count >= 5:
                    ev.status = "failed"
                ev.processed_at = datetime.utcnow()

        await session.commit()
        return processed_count

@celery_app.task(name="app.ai.celery_tasks.relay_outbox_events_task")
def relay_outbox_events_task() -> int:
    """Periodic task executed by Celery Beat every 2 seconds."""
    return asyncio.run(async_relay_outbox_events())

async def async_check_expired_assignment_offers() -> int:
    """Background routine to auto-expire offers past their 90s deadline."""
    from app.modules.responder.service import auto_expire_assignment_offers
    async with AsyncSessionLocal() as session:
        try:
            return await auto_expire_assignment_offers(session)
        except Exception as e:
            logger.error(f"Error checking expired assignment offers: {e}", exc_info=True)
            return 0

@celery_app.task(name="app.ai.celery_tasks.check_expired_assignment_offers_task")
def check_expired_assignment_offers_task() -> int:
    """Periodic task executed by Celery Beat every 10 seconds."""
    return asyncio.run(async_check_expired_assignment_offers())

