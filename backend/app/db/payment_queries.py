"""
OmniTrust Backend — Payment & PayPal Webhook Database Queries

Typed DB helpers for `payment_transactions` and `paypal_webhook_events`.
"""
from typing import Any
from supabase import Client


def create_payment_transaction(db: Client, fields: dict[str, Any]) -> dict[str, Any]:
    """Insert a new payment_transaction record."""
    res = db.table("payment_transactions").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return fields


def get_payment_transaction_by_order_id(db: Client, order_id: str) -> dict[str, Any] | None:
    """Fetch the latest payment transaction for an order."""
    res = (
        db.table("payment_transactions")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_payment_transaction_by_paypal_order_id(db: Client, paypal_order_id: str) -> dict[str, Any] | None:
    """Fetch payment transaction by PayPal order ID."""
    res = (
        db.table("payment_transactions")
        .select("*")
        .eq("paypal_order_id", paypal_order_id)
        .limit(1)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_payment_transaction_by_authorization_id(db: Client, authorization_id: str) -> dict[str, Any] | None:
    """Fetch payment transaction by authorization ID."""
    res = (
        db.table("payment_transactions")
        .select("*")
        .eq("authorization_id", authorization_id)
        .limit(1)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def get_payment_transaction_by_capture_id(db: Client, capture_id: str) -> dict[str, Any] | None:
    """Fetch payment transaction by capture ID."""
    res = (
        db.table("payment_transactions")
        .select("*")
        .eq("capture_id", capture_id)
        .limit(1)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None


def update_payment_transaction(db: Client, transaction_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Update payment transaction fields."""
    res = (
        db.table("payment_transactions")
        .update(fields)
        .eq("id", transaction_id)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return {"id": transaction_id, **fields}


def record_paypal_webhook_event(db: Client, fields: dict[str, Any]) -> dict[str, Any]:
    """Persist a PayPal webhook event for idempotency and audit."""
    res = db.table("paypal_webhook_events").insert(fields).execute()
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return fields


def get_paypal_webhook_event(db: Client, event_id: str) -> dict[str, Any] | None:
    """Check if a webhook event ID has already been recorded."""
    res = (
        db.table("paypal_webhook_events")
        .select("*")
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    if res and res.data and len(res.data) > 0:
        return res.data[0]
    return None
