import json
import hmac
import hashlib
import httpx
import time
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.webhook_event import WebhookEvent
from app.config import settings

logger = logging.getLogger("mock-logistics.webhook")


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def create_and_send_webhook(
    db: Session,
    tracking_id: str,
    order_id: str,
    status: str,
    goods_condition: str,
    damage_reason: str | None = None,
    idempotency_key: str | None = None,
) -> WebhookEvent:
    """Create a webhook event and attempt delivery. Idempotent if idempotency_key is provided."""

    # Check for existing event with same idempotency key
    if idempotency_key:
        existing = db.query(WebhookEvent).filter(
            WebhookEvent.idempotency_key == idempotency_key
        ).first()
        if existing:
            return existing

    # 1. Construct canonical payload
    event_id = str(uuid.uuid4())
    payload = {
        "event_id": event_id,
        "event": "SHIPMENT_STATUS_CHANGED",
        "tracking_id": tracking_id,
        "order_id": order_id,
        "status": status,
        "goods_condition": goods_condition,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    }
    if damage_reason:
        payload["damage_reason"] = damage_reason

    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _sign(body, settings.logistics_webhook_secret)

    # Generate idempotency key if not provided
    idem_key = idempotency_key or f"{tracking_id}-{status}-{event_id}"

    # 2. Persist webhook event
    event = WebhookEvent(
        tracking_id=tracking_id,
        event_type=status,
        payload=body.decode("utf-8"),
        signature=signature,
        idempotency_key=idem_key,
    )
    db.add(event)
    try:
        db.commit()
        db.refresh(event)
    except IntegrityError:
        db.rollback()
        # Race condition: another request created the same event
        existing = db.query(WebhookEvent).filter(
            WebhookEvent.idempotency_key == idem_key
        ).first()
        if existing:
            return existing
        raise

    # 3. Try sending (synchronous for now — could be backgrounded)
    _dispatch_webhook(db, event)
    return event


def retry_webhook(db: Session, event_id: str) -> WebhookEvent | None:
    event = db.query(WebhookEvent).filter(WebhookEvent.id == event_id).first()
    if not event:
        return None
    if event.delivery_status == "SENT":
        return event  # Already delivered, return existing result
    
    # Reset for retry
    event.delivery_status = "PENDING"
    event.last_error = None
    db.commit()
    
    _dispatch_webhook(db, event)
    return event


def _dispatch_webhook(db: Session, event: WebhookEvent):
    headers = {
        "Content-Type": "application/json",
        "X-Logistics-Signature": event.signature
    }
    body = event.payload.encode("utf-8")

    delays = [1, 3]  # Attempt 1 -> 1s -> Attempt 2 -> 3s -> Attempt 3

    while event.attempt_count < settings.webhook_max_retries:
        event.attempt_count += 1
        db.commit()

        try:
            with httpx.Client(timeout=settings.webhook_timeout_seconds) as client:
                res = client.post(settings.omnitrust_webhook_url, content=body, headers=headers)
                event.response_code = res.status_code
                db.commit()

                if res.status_code == 200:
                    event.delivery_status = "SENT"
                    event.delivered_at = datetime.now(timezone.utc)
                    event.last_error = None
                    db.commit()
                    logger.info(f"Webhook delivered: {event.tracking_id} -> HTTP 200")
                    return
                else:
                    error_msg = f"HTTP {res.status_code}"
                    event.last_error = error_msg
                    event.delivery_status = "FAILED"
                    db.commit()
                    logger.warning(f"Webhook failed: {event.tracking_id} -> {error_msg}")
        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {str(exc)[:200]}"
            event.last_error = error_msg
            event.delivery_status = "FAILED"
            event.response_code = None
            db.commit()
            logger.warning(f"Webhook error: {event.tracking_id} -> {error_msg}")

        if event.attempt_count < settings.webhook_max_retries:
            # wait before next retry
            delay_idx = min(event.attempt_count - 1, len(delays) - 1)
            time.sleep(delays[delay_idx])
