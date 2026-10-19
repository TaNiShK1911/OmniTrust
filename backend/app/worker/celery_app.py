"""
OmniTrust Celery Application Factory & Configuration
"""
import os
import logging
from celery import Celery

logger = logging.getLogger("omnitrust.worker")

def get_broker_url() -> str:
    # Check environment variable first (Render Key Value injection), then fall back to default
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "omnitrust_worker",
    broker=get_broker_url(),
    backend=get_broker_url(),
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,        # Hard timeout: 5 minutes
    task_soft_time_limit=240,   # Soft timeout: 4 minutes
    worker_prefetch_multiplier=1,
    task_acks_late=True,        # Resilient to worker crashes
    broker_connection_retry_on_startup=True,
    task_routes={
        "app.worker.tasks.process_settlement_capture_task": {"queue": "settlements"},
        "app.worker.tasks.dispatch_audit_telemetry_task": {"queue": "telemetry"},
        "app.worker.tasks.ping_worker_task": {"queue": "default"},
    },
)
