"""
OmniTrust Backend — Logistics Webhook Handler

Receives physical-world events from the Mock 3PL (or any logistics provider).
SECURITY CRITICAL: Signature verification happens BEFORE any payload parsing
or state mutation. A failed signature immediately returns 401 with zero
financial action.
"""
from fastapi import APIRouter, Request, Response

from app.config import get_settings
from app.db import queries
from app.db.supabase import get_supabase_admin
from app.security.webhook_signatures import verify_signature
from app.services import dispute_service, settlement_service
from app.services.audit_service import log_event

router = APIRouter(tags=["webhooks"])


@router.post("/api/webhooks/logistics")
async def logistics_webhook(request: Request):
    """
    Process a signed logistics event.

    Processing order (hard-coded, not configurable):
      1. Verify HMAC signature → 401 if invalid
      2. Parse payload
      3. Validate tracking/order association → 404 if unknown
      4. Check idempotency → 200 no-op if already seen
      5. Persist raw event
      6. Update shipment + order status
      7. If DELIVERED → run settlement gate → settle
      8. If DAMAGED → create dispute
      9. Return 200 only after durable write
    """
    settings = get_settings()
    raw_body = await request.body()
    signature = request.headers.get("x-logistics-signature", "")

    # ── Step 1: Verify signature ──────────────────────────────────────────────
    if not verify_signature(raw_body, signature, settings.logistics_webhook_secret):
        return Response(
            content='{"success":false,"error":{"code":"INVALID_SIGNATURE","message":"Signature verification failed"},"financial_action":"none"}',
            status_code=401,
            media_type="application/json",
        )

    # ── Step 2: Parse payload ─────────────────────────────────────────────────
    import json

    try:
        payload: dict = json.loads(raw_body)
    except Exception:
        return Response(
            content='{"success":false,"error":{"code":"MALFORMED_PAYLOAD","message":"Invalid JSON"}}',
            status_code=400,
            media_type="application/json",
        )

    tracking_id: str = payload.get("tracking_id", "")
    event_type: str = payload.get("event", "")
    status: str = payload.get("status", "")
    condition: str = payload.get("goods_condition", "")
    occurred_at: str = payload.get("timestamp", "")
    event_id: str = payload.get("event_id", "")

    db = get_supabase_admin()

    # ── Step 3: Validate tracking ID ─────────────────────────────────────────
    shipment = queries.get_shipment_by_tracking(db, tracking_id)
    if not shipment:
        return Response(
            content=f'{{"success":false,"error":{{"code":"SHIPMENT_NOT_FOUND","message":"Tracking {tracking_id} unknown"}}}}',
            status_code=404,
            media_type="application/json",
        )

    order = shipment["orders"]
    order_id: str = order["id"]
    user_id: str = shipment["user_id"]

    # ── Step 4: Idempotency ───────────────────────────────────────────────────
    already_seen = queries.check_audit_event_exists(db, event_id, "webhook.verified")
    if already_seen:
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="webhook",
            event_type="webhook.duplicate",
            actor="OmniTrust Verifier",
            entity=tracking_id,
            status="warning",
            request_id=event_id,
            decision="IDEMPOTENT_NO_OP",
            payload={"reason": "duplicate event_id", "financial_action": "none"},
        )
        return Response(
            content='{"success":true,"duplicate":true,"financial_action":"none"}',
            status_code=200,
            media_type="application/json",
        )

    # ── Step 5: Log verified event ────────────────────────────────────────────
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="webhook",
        event_type="webhook.verified",
        actor="OmniTrust Verifier",
        entity=tracking_id,
        request_id=event_id,
        decision="SIGNATURE_VALID",
        payload={
            "algorithm": "HMAC-SHA256",
            "event": event_type,
            "status": status,
            "condition": condition,
            "signature_prefix": f"{signature[:12]}…redacted",
        },
    )

    delivered = status == "DELIVERED"

    # ── Step 6: Update shipment + order ──────────────────────────────────────
    queries.update_shipment(
        db,
        shipment["id"],
        {
            "status": "delivered" if delivered else "damaged",
            "condition": "intact" if delivered else "damaged",
            "last_event_at": occurred_at or None,
        },
    )
    queries.update_order(
        db,
        order_id,
        {"status": "delivered" if delivered else "disputed"},
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="logistics",
        event_type="shipment.delivered" if delivered else "shipment.damaged",
        actor="Mock 3PL",
        entity=tracking_id,
        status="success" if delivered else "warning",
        decision="DELIVERED" if delivered else "DAMAGE_REPORTED",
        payload={"condition": condition, "occurred_at": occurred_at},
    )

    dispute_id: str | None = None

    # ── Step 7: Settlement (DELIVERED path) ───────────────────────────────────
    if delivered:
        settlement_service.settle_order(db, order_id=order_id, user_id=user_id)

    # ── Step 8: Dispute (DAMAGED path) ───────────────────────────────────────
    else:
        dispute = dispute_service.create_dispute(
            db, order_id=order_id, user_id=user_id, reason="DAMAGED_GOODS"
        )
        dispute_id = dispute.get("id")

    dispute_val = f'"{dispute_id}"' if dispute_id else "null"
    return Response(
        content=f'{{"success":true,"delivered":{str(delivered).lower()},"dispute_id":{dispute_val}}}',
        status_code=200,
        media_type="application/json",
    )
