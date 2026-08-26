"""
OmniTrust Backend — Escrow Service

Creates and queries the Razorpay test-mode escrow state for an order.
Idempotent: calling create_escrow twice on the same order returns the
existing state without triggering a second Razorpay call.
"""
from supabase import Client

from app.db import queries
from app.integrations.razorpay_client import payment_provider
from app.services.audit_service import log_event
from app.services.idempotency_service import check_already_done


def create_escrow(db: Client, *, order_id: str, user_id: str) -> dict:
    """
    Create Razorpay test-mode virtual account for the order.
    Idempotent: returns existing escrow if already funded.
    """
    order = queries.get_order(db, order_id)

    if order["escrow_status"] == "held":
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="payment",
            event_type="escrow.duplicate_suppressed",
            actor="Escrow Service",
            status="warning",
            request_id=order.get("idempotency_key"),
            decision="IDEMPOTENT_NO_OP",
            payload={"escrow_ref": order.get("escrow_ref")},
        )
        return order

    if order["status"] not in ("awaiting_escrow", "escrow_pending"):
        raise ValueError(f"Order {order_id} is not in an escrowable state (status={order['status']})")

    total = float(order["total_amount"])
    currency = order.get("currency", "INR")

    # Call Razorpay adapter
    result = payment_provider.create_virtual_account(
        db, user_id, order_id, total, currency
    )

    # Persist escrow reference on the order
    updated = queries.update_order(
        db,
        order_id,
        {
            "escrow_status": "held",
            "escrow_ref": result["provider_reference"],
            "status": "escrow_held",
        },
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="payment",
        event_type="escrow.created",
        actor="Payment Provider (test mode)",
        entity=result["provider_reference"],
        request_id=order.get("idempotency_key"),
        decision="FUNDS_HELD",
        latency_ms=200,
        payload={
            "provider": result.get("provider"),
            "provider_ref": result["provider_reference"],
            "amount": total,
            "currency": currency,
            "api_key": "redacted",
        },
    )
    return updated


def get_escrow_status(db: Client, order_id: str) -> dict:
    order = queries.get_order(db, order_id)
    return {
        "order_id": order_id,
        "escrow_status": order["escrow_status"],
        "escrow_ref": order.get("escrow_ref"),
        "amount": order["total_amount"],
        "currency": order.get("currency", "INR"),
    }
