import json
import hmac
import hashlib
import httpx
import time
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.webhook_event import WebhookEvent
from app.config import settings

def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

def create_and_send_webhook(
    db: Session,
    tracking_id: str,
    order_id: str,
    status: str,
    goods_condition: str,
    damage_reason: str | None = None
) -> WebhookEvent:
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

    # 2. Persist webhook event
    event = WebhookEvent(
        tracking_id=tracking_id,
        event_type=status,
        payload=body.decode("utf-8"),
        signature=signature
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # 3. Try sending
    _dispatch_webhook(db, event)
    return event

def retry_webhook(db: Session, event_id: str) -> WebhookEvent | None:
    event = db.query(WebhookEvent).filter(WebhookEvent.id == event_id).first()
    if not event or event.delivery_status == "SENT":
        return event
    
    _dispatch_webhook(db, event)
    return event

def _dispatch_webhook(db: Session, event: WebhookEvent):
    headers = {
        "Content-Type": "application/json",
        "X-Logistics-Signature": event.signature
    }
    body = event.payload.encode("utf-8")

    delays = [1, 3] # Attempt 1 -> 1s -> Attempt 2 -> 3s -> Attempt 3

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
                    db.commit()
                    return
                else:
                    event.delivery_status = "FAILED"
                    db.commit()
        except Exception:
            event.delivery_status = "FAILED"
            db.commit()

        if event.attempt_count < settings.webhook_max_retries:
            # wait before next retry
            time.sleep(delays[event.attempt_count - 1])
