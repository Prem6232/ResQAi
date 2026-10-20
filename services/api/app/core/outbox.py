import uuid
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.outbox import OutboxEvent

async def create_outbox_event(
    session: AsyncSession,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    event_type: str,
    payload: Dict[str, Any]
) -> OutboxEvent:
    """Write an event to the transactional outbox table within current transaction."""
    event = OutboxEvent(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        event_type=event_type,
        payload=payload,
        status="pending",
        retry_count=0,
        created_at=datetime.utcnow()
    )
    session.add(event)
    return event

async def claim_pending_outbox_events(
    session: AsyncSession,
    batch_size: int = 50
) -> List[OutboxEvent]:
    """
    Claim pending outbox events safely using FOR UPDATE SKIP LOCKED.
    Ensures horizontal scalability without duplicate publishing across multiple worker replicas.
    """
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.status == "pending")
        .order_by(OutboxEvent.created_at.asc())
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())

async def mark_outbox_event_published(session: AsyncSession, event_id: uuid.UUID) -> None:
    stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if event:
        event.status = "published"
        event.processed_at = datetime.utcnow()
        await session.commit()

async def mark_outbox_event_failed(session: AsyncSession, event_id: uuid.UUID) -> None:
    stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if event:
        event.retry_count += 1
        if event.retry_count >= 5:
            event.status = "failed"
        event.processed_at = datetime.utcnow()
        await session.commit()
