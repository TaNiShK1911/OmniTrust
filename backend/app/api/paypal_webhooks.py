"""
OmniTrust Backend — PayPal Webhook Handler

Listens for PayPal Sandbox webhooks at POST /api/webhooks/paypal.
Verifies authenticity against PayPal's POST /v1/notifications/verify-webhook-signature.
Deduplicates event IDs and correlates with internal payment transactions and legal state transitions.

CRITICAL:
- Does NOT use logistics HMAC. PayPal webhooks have their own cryptographic verification API.
- Idempotent: duplicate event deliveries return HTTP 200 without re-executing transitions.
"""
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from supabase import Client

from app.config import get_settings
from app.db import payment_queries, queries
from app.db.supabase import get_supabase_admin
from app.integrations.paypal_client import PayPalClient, paypal_client
from app.schemas.payments import PaymentState, can_transition, validate_transition
from app.services.audit_service import log_event

logger = logging.getLogger("omnitrust.paypal_webhooks")

router = APIRouter(prefix="/api/webhooks", tags=["PayPal Webhooks"])


@router.post("/paypal", status_code=status.HTTP_200_OK)
async def handle_paypal_webhook(
    request: Request,
    db: Client = Depends(get_supabase_admin),
    paypal_transmission_id: str | None = Header(None, alias="paypal-transmission-id"),
    paypal_transmission_time: str | None = Header(None, alias="paypal-transmission-time"),
    paypal_transmission_sig: str | None = Header(None, alias="paypal-transmission-sig"),
    paypal_cert_url: str | None = Header(None, alias="paypal-cert-url"),
    paypal_auth_algo: str | None = Header(None, alias="paypal-auth-algo"),
) -> dict[str, Any]:
    """
    Handle PayPal webhook notifications.
    Validates signature via PayPal API and applies state machine transitions.
    """
    settings = get_settings()

    # 1. Validate required PayPal transmission headers
    if not all([
        paypal_transmission_id,
        paypal_transmission_time,
        paypal_transmission_sig,
        paypal_cert_url,
        paypal_auth_algo,
    ]):
        logger.warning("Missing PayPal transmission headers in webhook request")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required PayPal webhook transmission headers",
        )

    # 2. Parse event payload
    try:
        body_bytes = await request.body()
        event_payload = json.loads(body_bytes.decode("utf-8"))
    except Exception as exc:
        logger.warning("Malformed JSON in PayPal webhook: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed JSON payload",
        ) from exc

    event_id = event_payload.get("id")
    event_type = event_payload.get("event_type")
    resource = event_payload.get("resource", {})

    if not event_id or not event_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event payload missing id or event_type",
        )

    # 3. Check for replay/duplicate event
    existing_event = payment_queries.get_paypal_webhook_event(db, event_id)
    if existing_event:
        logger.info("Duplicate PayPal webhook event %s received; returning 200 OK", event_id)
        return {
            "status": "duplicate_suppressed",
            "event_id": event_id,
            "message": "Event already processed",
        }

    # 4. Verify signature with PayPal API
    # In test environment if webhook_id is not set, allow bypass only if test header configured
    webhook_id = settings.paypal_webhook_id
    if webhook_id:
        is_valid = await paypal_client.verify_webhook_signature(
            transmission_id=paypal_transmission_id,  # type: ignore[arg-type]
            transmission_time=paypal_transmission_time,  # type: ignore[arg-type]
            cert_url=paypal_cert_url,  # type: ignore[arg-type]
            auth_algo=paypal_auth_algo,  # type: ignore[arg-type]
            transmission_sig=paypal_transmission_sig,  # type: ignore[arg-type]
            webhook_id=webhook_id,
            webhook_event=event_payload,
        )
        if not is_valid:
            logger.warning("PayPal webhook signature verification failed for event %s", event_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="PayPal webhook signature verification failed",
            )
    else:
        # Warning if not configured
        logger.warning(
            "PAYPAL_WEBHOOK_ID not configured; webhook signature verification skipped in dev/test"
        )

    # 5. Persist event first for durable deduplication
    payment_queries.record_paypal_webhook_event(
        db,
        {
            "event_id": event_id,
            "transmission_id": paypal_transmission_id,
            "event_type": event_type,
            "resource_type": event_payload.get("resource_type"),
            "summary": event_payload.get("summary", ""),
            "status": "received",
            "payload": event_payload,
        },
    )

    # 6. Correlate with transaction and apply state transitions
    tx: dict[str, Any] | None = None
    target_order_id: str | None = None

    if event_type == "CHECKOUT.ORDER.APPROVED":
        paypal_order_id = resource.get("id")
        if paypal_order_id:
            tx = payment_queries.get_payment_transaction_by_paypal_order_id(db, paypal_order_id)
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.PENDING_AUTHORIZATION):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {"state": PaymentState.PENDING_AUTHORIZATION.value},
                )
                target_order_id = tx["order_id"]

    elif event_type == "PAYMENT.AUTHORIZATION.CREATED":
        auth_id = resource.get("id")
        custom_id = resource.get("custom_id")
        if auth_id:
            tx = payment_queries.get_payment_transaction_by_authorization_id(db, auth_id)
            if not tx and custom_id:
                tx = payment_queries.get_payment_transaction_by_order_id(db, custom_id)
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.FUNDS_AUTHORIZED):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {
                        "authorization_id": auth_id,
                        "state": PaymentState.FUNDS_AUTHORIZED.value,
                        "provider_order_status": resource.get("status", "CREATED"),
                        "authorization_expires_at": resource.get("expiration_time"),
                    },
                )
                queries.update_order(
                    db,
                    tx["order_id"],
                    {"status": "escrow_held", "escrow_status": "held", "escrow_ref": auth_id},
                )
                target_order_id = tx["order_id"]

    elif event_type == "PAYMENT.AUTHORIZATION.VOIDED":
        auth_id = resource.get("id")
        if auth_id:
            tx = payment_queries.get_payment_transaction_by_authorization_id(db, auth_id)
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.VOIDED):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {"state": PaymentState.VOIDED.value, "provider_order_status": "VOIDED"},
                )
                queries.update_order(
                    db,
                    tx["order_id"],
                    {"status": "cancelled", "escrow_status": "refunded"},
                )
                target_order_id = tx["order_id"]

    elif event_type == "PAYMENT.CAPTURE.COMPLETED":
        capture_id = resource.get("id")
        if capture_id:
            tx = payment_queries.get_payment_transaction_by_capture_id(db, capture_id)
            if not tx and resource.get("custom_id"):
                tx = payment_queries.get_payment_transaction_by_order_id(db, resource["custom_id"])
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.CAPTURED_AND_SETTLED):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {
                        "capture_id": capture_id,
                        "state": PaymentState.CAPTURED_AND_SETTLED.value,
                        "provider_order_status": "COMPLETED",
                    },
                )
                queries.update_order(
                    db,
                    tx["order_id"],
                    {"status": "settled", "escrow_status": "released", "settlement_ref": capture_id},
                )
                target_order_id = tx["order_id"]

    elif event_type == "PAYMENT.CAPTURE.DENIED":
        capture_id = resource.get("id")
        if capture_id:
            tx = payment_queries.get_payment_transaction_by_capture_id(db, capture_id)
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.PAYMENT_FAILED):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {"state": PaymentState.PAYMENT_FAILED.value, "provider_order_status": "DENIED"},
                )
                target_order_id = tx["order_id"]

    elif event_type == "PAYMENT.CAPTURE.REFUNDED":
        refund_id = resource.get("id")
        links = resource.get("links", [])
        up_link = next((lk.get("href") for lk in links if lk.get("rel") == "up"), "")
        parent_capture_id = up_link.split("/")[-1] if up_link else None

        if parent_capture_id:
            tx = payment_queries.get_payment_transaction_by_capture_id(db, parent_capture_id)
            if tx and can_transition(PaymentState(tx["state"]), PaymentState.REFUNDED):
                payment_queries.update_payment_transaction(
                    db,
                    tx["id"],
                    {
                        "last_refund_id": refund_id,
                        "state": PaymentState.REFUNDED.value,
                        "provider_order_status": "REFUNDED",
                    },
                )
                queries.update_order(
                    db,
                    tx["order_id"],
                    {"status": "refunded", "escrow_status": "refunded", "refund_ref": refund_id},
                )
                target_order_id = tx["order_id"]

    # Log audit event
    if target_order_id:
        log_event(
            db,
            user_id="paypal_webhook_actor",
            order_id=target_order_id,
            category="payment",
            event_type=f"paypal.webhook.{event_type.lower()}",
            actor="PayPal Webhook",
            entity=event_id,
            decision="WEBHOOK_PROCESSED",
            payload={
                "event_id": event_id,
                "event_type": event_type,
                "resource_id": resource.get("id"),
            },
        )

    return {
        "status": "processed",
        "event_id": event_id,
        "event_type": event_type,
        "order_id": target_order_id,
    }
