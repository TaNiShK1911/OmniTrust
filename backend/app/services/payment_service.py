"""
OmniTrust Backend — Payment Service Orchestrator

Durable payment operations coordinator for PayPal Orders v2 and Payments v2.
Enforces:
- Server-side order ownership and role validation
- Idempotency with unique keys per operation
- Pre-mutation pending state persistence before provider calls
- Strict canonical state transitions
- Audit logging of all provider interactions with secrets redacted
"""
from datetime import datetime, timezone
from decimal import Decimal
import logging
import time
from typing import Any
from uuid import uuid4

from supabase import Client

from app.config import get_settings
from app.db import payment_queries, queries
from app.integrations.paypal_client import PayPalClient, PayPalError, paypal_client
from app.schemas.payments import PaymentState, format_money, validate_transition
from app.services.audit_service import log_event
from app.services.gatekeeper import run_settlement_checks
from app.services.idempotency_service import provider_ref
from app.services.payment_currency import SettlementTerms, settlement_terms

logger = logging.getLogger("omnitrust.payment_service")


def payment_terms_for_order(order: dict[str, Any]) -> SettlementTerms:
    """Return the reviewed provider settlement amount for a source-currency order."""
    settings = get_settings()
    return settlement_terms(
        source_amount=Decimal(str(order["total_amount"])),
        source_currency=order.get("currency", "USD"),
        settlement_currency=settings.paypal_settlement_currency,
        inr_to_usd_rate=settings.paypal_inr_to_usd_rate,
    )


def get_payment_status(db: Client, *, order_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Retrieve canonical payment status and references for an order."""
    tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)
    order = (
        queries.get_order_for_user(db, order_id, user_id)
        if user_id is not None
        else queries.get_order(db, order_id)
    )

    if tx:
        metadata = tx.get("metadata", {}) or {}
        return {
            "order_id": order_id,
            "transaction_id": tx.get("id"),
            "provider": tx.get("provider", "paypal_sandbox"),
            "state": tx.get("state", PaymentState.PENDING_APPROVAL.value),
            "paypal_order_id": tx.get("paypal_order_id"),
            "authorization_id": tx.get("authorization_id"),
            "capture_id": tx.get("capture_id"),
            "last_refund_id": tx.get("last_refund_id"),
            "amount": format_money(Decimal(str(tx.get("amount", order.get("total_amount", 0))))),
            "currency": tx.get("currency", order.get("currency", "USD")),
            "source_amount": metadata.get("source_amount", format_money(Decimal(str(order.get("total_amount", 0))))),
            "source_currency": metadata.get("source_currency", order.get("currency", "USD")),
            "conversion_rate": metadata.get("conversion_rate"),
            "authorization_expires_at": tx.get("authorization_expires_at"),
            "escrow_status": order.get("escrow_status"),
            "order_status": order.get("status"),
        }

    # Fallback if transaction record not yet initialized
    return {
        "order_id": order_id,
        "transaction_id": None,
        "provider": "paypal_sandbox",
        "state": PaymentState.PENDING_APPROVAL.value if order.get("escrow_status") != "held" else PaymentState.FUNDS_AUTHORIZED.value,
        "paypal_order_id": order.get("escrow_ref") if (order.get("escrow_ref", "") or "").startswith("ORD-") else None,
        "authorization_id": order.get("escrow_ref") if (order.get("escrow_ref", "") or "").startswith("AUTH-") else None,
        "capture_id": order.get("settlement_ref"),
        "last_refund_id": order.get("refund_ref"),
        "amount": format_money(Decimal(str(order.get("total_amount", 0)))),
        "currency": order.get("currency", "USD"),
        "source_amount": format_money(Decimal(str(order.get("total_amount", 0)))),
        "source_currency": order.get("currency", "USD"),
        "conversion_rate": None,
        "authorization_expires_at": None,
        "escrow_status": order.get("escrow_status", "none"),
        "order_status": order.get("status", "created"),
    }


async def create_payment_order(
    db: Client,
    *,
    order_id: str,
    user_id: str,
    client: PayPalClient = paypal_client,
) -> dict[str, Any]:
    """
    Step 1: Create PayPal order with intent=AUTHORIZE.
    Buyer has not approved yet. Persists state=PENDING_APPROVAL.
    Idempotent: returns existing approval details if already created.
    """
    order = queries.get_order_for_user(db, order_id, user_id)

    # Check for existing transaction
    existing_tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)
    if existing_tx and existing_tx.get("paypal_order_id"):
        approval_url = existing_tx.get("metadata", {}).get("approval_url", "")
        return {
            "order_id": order_id,
            "paypal_order_id": existing_tx["paypal_order_id"],
            "approval_url": approval_url,
            "state": existing_tx["state"],
            "amount": str(existing_tx["amount"]),
            "currency": existing_tx["currency"],
        }

    terms = payment_terms_for_order(order)
    amount = terms.settlement_amount
    currency = terms.settlement_currency
    idem_key = order.get("idempotency_key") or provider_ref("pay_order")
    started = time.monotonic()

    # Call PayPal API
    resp = await client.create_order_authorization(
        amount=amount,
        currency=currency,
        order_id=order_id,
        request_id=idem_key,
    )

    paypal_order_id = resp.get("id")
    if not paypal_order_id:
        raise PayPalError("PayPal create order returned no order ID", status_code=502)

    links = resp.get("links", [])
    approve_link = next((lk.get("href") for lk in links if lk.get("rel") == "approve"), "")

    # Persist transaction
    tx_fields = {
        "order_id": order_id,
        "provider": "paypal_sandbox",
        "paypal_order_id": paypal_order_id,
        "amount": float(amount),
        "currency": currency,
        "state": PaymentState.PENDING_APPROVAL.value,
        "provider_order_status": resp.get("status", "CREATED"),
        "idempotency_key": idem_key,
        "metadata": {
            "approval_url": approve_link,
            "links": links,
            "source_amount": format_money(terms.source_amount),
            "source_currency": terms.source_currency,
            "settlement_amount": format_money(terms.settlement_amount),
            "settlement_currency": terms.settlement_currency,
            "conversion_rate": str(terms.conversion_rate) if terms.conversion_rate else None,
        },
    }
    tx = payment_queries.create_payment_transaction(db, tx_fields)

    # Update order status to escrow_pending
    queries.update_order(
        db,
        order_id,
        {
            "status": "escrow_pending",
            "escrow_status": "pending",
            "escrow_ref": paypal_order_id,
        },
    )

    latency_ms = int((time.monotonic() - started) * 1000)
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="payment",
        event_type="paypal.order_created",
        actor="PayPal Orders v2",
        entity=paypal_order_id,
        request_id=idem_key,
        latency_ms=latency_ms,
        decision="ORDER_CREATED",
        payload={
            "paypal_order_id": paypal_order_id,
            "intent": "AUTHORIZE",
            "amount": format_money(amount),
            "currency": currency,
            "source_amount": format_money(terms.source_amount),
            "source_currency": terms.source_currency,
            "conversion_rate": str(terms.conversion_rate) if terms.conversion_rate else None,
            "state": PaymentState.PENDING_APPROVAL.value,
        },
    )

    return {
        "order_id": order_id,
        "paypal_order_id": paypal_order_id,
        "approval_url": approve_link,
        "state": PaymentState.PENDING_APPROVAL.value,
        "amount": format_money(amount),
        "currency": currency,
        "source_amount": format_money(terms.source_amount),
        "source_currency": terms.source_currency,
        "conversion_rate": str(terms.conversion_rate) if terms.conversion_rate else None,
    }


async def authorize_payment(
    db: Client,
    *,
    order_id: str,
    paypal_order_id: str,
    user_id: str,
    client: PayPalClient = paypal_client,
) -> dict[str, Any]:
    """
    Step 2: Authorize payment after buyer approval.
    Validates that paypal_order_id belongs to order_id and persists state=FUNDS_AUTHORIZED.
    """
    order = queries.get_order_for_user(db, order_id, user_id)

    tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)
    if tx and tx.get("paypal_order_id") and tx.get("paypal_order_id") != paypal_order_id:
        raise ValueError(f"Mismatch: PayPal order {paypal_order_id} does not match order record")

    if tx and tx.get("state") == PaymentState.FUNDS_AUTHORIZED.value:
        # Idempotent return
        return {
            "ok": True,
            "order_id": order_id,
            "authorization_id": tx.get("authorization_id"),
            "state": PaymentState.FUNDS_AUTHORIZED.value,
            "message": "Payment already authorized",
        }

    # Set pending authorization
    current_state = PaymentState(tx.get("state", PaymentState.PENDING_APPROVAL.value)) if tx else PaymentState.PENDING_APPROVAL
    validate_transition(current_state, PaymentState.PENDING_AUTHORIZATION)

    if tx:
        payment_queries.update_payment_transaction(
            db, tx["id"], {"state": PaymentState.PENDING_AUTHORIZATION.value}
        )

    started = time.monotonic()
    auth_request_id = provider_ref("pay_auth")

    resp = await client.authorize_order(paypal_order_id, request_id=auth_request_id)

    # Extract authorization details
    units = resp.get("purchase_units", [])
    authorizations = (
        units[0].get("payments", {}).get("authorizations", [])
        if units
        else []
    )

    if not authorizations:
        raise PayPalError(
            "PayPal authorize response contained no authorizations",
            status_code=502,
            error_name="NO_AUTHORIZATION_FOUND",
        )

    auth_data = authorizations[0]
    auth_id = auth_data.get("id")
    auth_status = auth_data.get("status", "CREATED")
    expiration_time = auth_data.get("expiration_time")

    if not auth_id or auth_status not in ("CREATED", "PENDING"):
        raise PayPalError(
            f"PayPal authorization was not approved (status: {auth_status})",
            status_code=400,
            error_name="AUTHORIZATION_NOT_APPROVED",
        )

    # Transition to FUNDS_AUTHORIZED
    validate_transition(PaymentState.PENDING_AUTHORIZATION, PaymentState.FUNDS_AUTHORIZED)

    if tx:
        payment_queries.update_payment_transaction(
            db,
            tx["id"],
            {
                "authorization_id": auth_id,
                "state": PaymentState.FUNDS_AUTHORIZED.value,
                "provider_order_status": auth_status,
                "authorization_expires_at": expiration_time,
                "metadata": {**tx.get("metadata", {}), "authorization": auth_data},
            },
        )
    else:
        payment_queries.create_payment_transaction(
            db,
            {
                "order_id": order_id,
                "provider": "paypal_sandbox",
                "paypal_order_id": paypal_order_id,
                "authorization_id": auth_id,
                "amount": float(order["total_amount"]),
                "currency": order.get("currency", "USD"),
                "state": PaymentState.FUNDS_AUTHORIZED.value,
                "provider_order_status": auth_status,
                "authorization_expires_at": expiration_time,
                "idempotency_key": auth_request_id,
                "metadata": {"authorization": auth_data},
            },
        )

    # Update order state to escrow_held
    queries.update_order(
        db,
        order_id,
        {
            "status": "escrow_held",
            "escrow_status": "held",
            "escrow_ref": auth_id,
        },
    )

    latency_ms = int((time.monotonic() - started) * 1000)
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="payment",
        event_type="paypal.authorization_confirmed",
        actor="PayPal Payments v2",
        entity=auth_id,
        request_id=auth_request_id,
        latency_ms=latency_ms,
        decision="FUNDS_AUTHORIZED",
        payload={
            "authorization_id": auth_id,
            "status": auth_status,
            "expiration_time": expiration_time,
            "state": PaymentState.FUNDS_AUTHORIZED.value,
        },
    )

    return {
        "ok": True,
        "order_id": order_id,
        "authorization_id": auth_id,
        "state": PaymentState.FUNDS_AUTHORIZED.value,
        "expiration_time": expiration_time,
    }


async def capture_order(
    db: Client,
    *,
    order_id: str,
    user_id: str,
    client: PayPalClient = paypal_client,
) -> dict[str, Any]:
    """
    Step 3: Capture authorized funds after settlement gatekeeper passes.
    Deterministic gate verified FIRST: delivery must be verified, no open disputes.
    """
    order = queries.get_order_for_user(db, order_id, user_id)
    shipments = order.get("shipments") or []
    disputes = order.get("disputes") or []

    shipment = shipments[0] if shipments else None
    dispute = disputes[0] if disputes else None

    tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)

    # Idempotent return if already captured
    if tx and tx.get("state") == PaymentState.CAPTURED_AND_SETTLED.value:
        return {
            "ok": True,
            "already_settled": True,
            "order_id": order_id,
            "capture_id": tx.get("capture_id"),
            "state": PaymentState.CAPTURED_AND_SETTLED.value,
        }

    # Deterministic policy gate checks
    gate = run_settlement_checks(
        order_status=order["status"],
        escrow_status=order["escrow_status"],
        shipment_delivered=bool(shipment and shipment.get("status") == "delivered"),
        dispute_open=bool(dispute and dispute.get("status") == "open"),
        already_settled=bool(order.get("settlement_ref")),
    )

    if not gate.passed:
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="settlement",
            event_type="settlement.blocked",
            actor="Settlement Gate",
            status="failed",
            decision="BLOCKED",
            payload=gate.to_dict(),
        )
        return {
            "ok": False,
            "checks": gate.to_dict()["checks"],
            "state": tx.get("state") if tx else PaymentState.PENDING_APPROVAL.value,
            "message": "Settlement gate conditions not satisfied",
        }

    auth_id = (tx.get("authorization_id") if tx else None) or order.get("escrow_ref")
    if not auth_id:
        raise ValueError(f"No authorization ID found to capture for order {order_id}")

    # Set CAPTURE_PENDING
    if tx:
        validate_transition(PaymentState(tx["state"]), PaymentState.CAPTURE_PENDING)
        payment_queries.update_payment_transaction(
            db, tx["id"], {"state": PaymentState.CAPTURE_PENDING.value}
        )

    cap_request_id = provider_ref("pay_cap")
    started = time.monotonic()

    resp = await client.capture_authorization(auth_id, request_id=cap_request_id)
    capture_id = resp.get("id")
    status = resp.get("status", "COMPLETED")

    if not capture_id or status not in ("COMPLETED", "PENDING"):
        if tx:
            payment_queries.update_payment_transaction(
                db, tx["id"], {"state": PaymentState.PAYMENT_FAILED.value}
            )
        raise PayPalError(f"PayPal capture failed with status: {status}", status_code=502)

    # Persist CAPTURED_AND_SETTLED
    if tx:
        validate_transition(PaymentState.CAPTURE_PENDING, PaymentState.CAPTURED_AND_SETTLED)
        payment_queries.update_payment_transaction(
            db,
            tx["id"],
            {
                "capture_id": capture_id,
                "state": PaymentState.CAPTURED_AND_SETTLED.value,
                "provider_order_status": status,
                "metadata": {**tx.get("metadata", {}), "capture": resp},
            },
        )

    queries.update_order(
        db,
        order_id,
        {
            "status": "settled",
            "escrow_status": "released",
            "settlement_ref": capture_id,
        },
    )

    latency_ms = int((time.monotonic() - started) * 1000)
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="settlement",
        event_type="paypal.capture_completed",
        actor="PayPal Payments v2",
        entity=capture_id,
        request_id=cap_request_id,
        latency_ms=latency_ms,
        decision="SELLER_PAID",
        payload={
            "checks": gate.to_dict()["checks"],
            "authorization_id": auth_id,
            "capture_id": capture_id,
            "amount": float(order["total_amount"]),
            "state": PaymentState.CAPTURED_AND_SETTLED.value,
        },
    )

    return {
        "ok": True,
        "order_id": order_id,
        "capture_id": capture_id,
        "checks": gate.to_dict()["checks"],
        "state": PaymentState.CAPTURED_AND_SETTLED.value,
    }


async def void_order(
    db: Client,
    *,
    order_id: str,
    user_id: str,
    client: PayPalClient = paypal_client,
) -> dict[str, Any]:
    """
    Void an uncaptured authorization (all-or-nothing).
    """
    order = queries.get_order_for_user(db, order_id, user_id)
    tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)

    auth_id = (tx.get("authorization_id") if tx else None) or order.get("escrow_ref")
    if not auth_id:
        raise ValueError(f"No authorization ID found to void for order {order_id}")

    if tx and tx.get("state") == PaymentState.VOIDED.value:
        return {
            "ok": True,
            "order_id": order_id,
            "authorization_id": auth_id,
            "state": PaymentState.VOIDED.value,
            "message": "Authorization already voided",
        }

    if tx:
        validate_transition(PaymentState(tx["state"]), PaymentState.VOID_PENDING)
        payment_queries.update_payment_transaction(
            db, tx["id"], {"state": PaymentState.VOID_PENDING.value}
        )

    void_request_id = provider_ref("pay_void")
    started = time.monotonic()

    await client.void_authorization(auth_id, request_id=void_request_id)

    if tx:
        validate_transition(PaymentState.VOID_PENDING, PaymentState.VOIDED)
        payment_queries.update_payment_transaction(
            db, tx["id"], {"state": PaymentState.VOIDED.value}
        )

    queries.update_order(
        db,
        order_id,
        {
            "status": "cancelled",
            "escrow_status": "refunded",
        },
    )

    latency_ms = int((time.monotonic() - started) * 1000)
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="payment",
        event_type="paypal.authorization_voided",
        actor="PayPal Payments v2",
        entity=auth_id,
        request_id=void_request_id,
        latency_ms=latency_ms,
        decision="AUTHORIZATION_VOIDED",
        payload={
            "authorization_id": auth_id,
            "state": PaymentState.VOIDED.value,
        },
    )

    return {
        "ok": True,
        "order_id": order_id,
        "authorization_id": auth_id,
        "state": PaymentState.VOIDED.value,
    }


async def refund_order(
    db: Client,
    *,
    order_id: str,
    user_id: str,
    refund_amount: Decimal | None = None,
    note: str | None = None,
    client: PayPalClient = paypal_client,
) -> dict[str, Any]:
    """
    Refund a captured payment using the capture ID.
    Supports full or partial refund.
    """
    order = queries.get_order_for_user(db, order_id, user_id)
    tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)

    capture_id = (tx.get("capture_id") if tx else None) or order.get("settlement_ref")
    if not capture_id:
        raise ValueError(f"No capture ID found to refund for order {order_id}")

    terms = payment_terms_for_order(order)
    provider_total = Decimal(str(tx["amount"])) if tx else terms.settlement_amount
    provider_currency = (tx.get("currency") if tx else terms.settlement_currency) or terms.settlement_currency
    source_total = terms.source_amount
    source_refund = refund_amount if refund_amount is not None else source_total
    if source_refund <= 0 or source_refund > source_total:
        raise ValueError("Refund amount must be greater than zero and cannot exceed the source order total")
    if refund_amount is None:
        target_amount = provider_total
    elif terms.source_currency == provider_currency:
        target_amount = source_refund
    else:
        target_amount = settlement_terms(
            source_amount=source_refund,
            source_currency=terms.source_currency,
            settlement_currency=provider_currency,
            inr_to_usd_rate=terms.conversion_rate,
        ).settlement_amount
    is_partial = source_refund < source_total
    next_state = PaymentState.PARTIALLY_REFUNDED if is_partial else PaymentState.REFUNDED

    if tx:
        validate_transition(PaymentState(tx["state"]), PaymentState.REFUND_PENDING)
        payment_queries.update_payment_transaction(
            db, tx["id"], {"state": PaymentState.REFUND_PENDING.value}
        )

    ref_request_id = provider_ref("pay_rfnd")
    started = time.monotonic()

    resp = await client.refund_capture(
        capture_id=capture_id,
        request_id=ref_request_id,
        amount=target_amount,
        currency=provider_currency,
        note_to_payer=note,
    )

    refund_id = resp.get("id")

    if tx:
        validate_transition(PaymentState.REFUND_PENDING, next_state)
        payment_queries.update_payment_transaction(
            db,
            tx["id"],
            {
                "last_refund_id": refund_id,
                "state": next_state.value,
                "metadata": {**tx.get("metadata", {}), "refund": resp},
            },
        )

    queries.update_order(
        db,
        order_id,
        {
            "status": "refunded",
            "escrow_status": "refunded",
            "refund_ref": refund_id,
            "refund_amount": float(source_refund),
        },
    )

    latency_ms = int((time.monotonic() - started) * 1000)
    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="refund",
        event_type="paypal.refund_completed",
        actor="PayPal Payments v2",
        entity=refund_id or capture_id,
        request_id=ref_request_id,
        latency_ms=latency_ms,
        decision="REFUND_EXECUTED",
        payload={
            "capture_id": capture_id,
            "refund_id": refund_id,
            "source_amount": format_money(source_refund),
            "source_currency": terms.source_currency,
            "settlement_amount": format_money(target_amount),
            "settlement_currency": provider_currency,
            "state": next_state.value,
        },
    )

    return {
        "ok": True,
        "order_id": order_id,
        "refund_id": refund_id,
        "refund_amount": format_money(source_refund),
        "refund_currency": terms.source_currency,
        "settlement_refund_amount": format_money(target_amount),
        "settlement_currency": provider_currency,
        "state": next_state.value,
    }
