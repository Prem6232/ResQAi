import os
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "sentinelgrid_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.ai.celery_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "relay-outbox-events-every-2s": {
            "task": "app.ai.celery_tasks.relay_outbox_events_task",
            "schedule": 2.0,
        },
        "expire-dispatch-offers-every-10s": {
            "task": "app.ai.celery_tasks.check_expired_assignment_offers_task",
            "schedule": 10.0,
        },
    }
)
