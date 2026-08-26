"""
OmniTrust Backend — Dispute Service

Handles the full damaged-goods dispute lifecycle:
  create_dispute → run_arbitration → execute_refund
"""
from supabase import Client

from app.agents.arbitrator_agent import arbitrate
from app.config import get_settings
from app.db import queries
from app.integrations.razorpay_client import payment_provider
from app.services.audit_service import log_event
from app.services.gatekeeper import run_refund_checks
from app.services.idempotency_service import provider_ref

_POLICY_REFUND_CAP_PCT = 60.0


def create_dispute(
    db: Client,
    *,
    order_id: str,
    user_id: str,
    reason: str = "DAMAGED_GOODS",
) -> dict:
    """Create an open dispute for a damaged shipment."""
    order = queries.get_order(db, order_id)

    # Check no existing open dispute
    existing = queries.list_disputes_for_order(db, order_id)
    open_dispute = next((d for d in existing if d["status"] == "open"), None)
    if open_dispute:
        return open_dispute

    dispute = queries.create_dispute(
        db,
        {
            "user_id": user_id,
            "order_id": order_id,
            "status": "open",
            "reason": reason,
        },
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order_id,
        category="dispute",
        event_type="dispute.created",
        actor="System",
        entity=dispute["id"],
        status="warning",
        request_id=provider_ref("dsp"),
        decision="DISPUTE_OPEN",
        payload={"reason": reason, "escrow": "still held"},
    )
    return dispute


def run_arbitration(db: Client, *, dispute_id: str, user_id: str) -> dict:
    """
    Run the Arbitrator Agent and persist the recommendation.
    The agent cannot execute a refund — that requires calling execute_refund.
    """
    dispute = queries.get_dispute(db, dispute_id)
    order = dispute["orders"]

    if dispute["status"] not in ("open", "arbitrating"):
        raise ValueError(f"Dispute {dispute_id} is not open (status={dispute['status']})")

    shipments = queries.list_shipments(db, user_id=None)
    shipment = next((s for s in shipments if s.get("order_id") == order["id"]), None)

    decision, latency, ai_used, ai_error = arbitrate(
        order_id=order["id"],
        total_paid=float(order["total_amount"]),
        shipment_status=shipment["status"] if shipment else "unknown",
        goods_condition=shipment["condition"] if shipment else "unknown",
        dispute_reason=dispute["reason"],
        policy_refund_cap_pct=_POLICY_REFUND_CAP_PCT,
    )

    updated = queries.update_dispute(
        db,
        dispute_id,
        {
            "status": "arbitrated",
            "decision": decision.decision,
            "penalty_pct": decision.penalty_percent,
            "refund_amount": decision.refund_amount,
            "confidence": decision.confidence,
        },
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order["id"],
        category="dispute",
        event_type="arbitrator.decision",
        actor="Arbitrator Agent",
        entity=dispute_id,
        decision=decision.decision,
        latency_ms=int(latency * 1000),
        payload={
            "model": "openai/gpt-oss-20b" if ai_used else "deterministic-fallback",
            "ai_used": ai_used,
            "decision": decision.decision,
            "penalty_percent": decision.penalty_percent,
            "refund_amount": decision.refund_amount,
            "reason_code": decision.reason_code,
            "confidence": decision.confidence,
            "hidden_reasoning": "redacted",
            "provider_error": ai_error,
        },
    )
    return updated


def execute_refund(db: Client, *, dispute_id: str, user_id: str) -> dict:
    """
    Execute the bounded refund through Razorpay after policy validation.
    The refund gate is the final authority — the agent recommendation alone
    is not sufficient to trigger a financial action.
    """
    dispute = queries.get_dispute(db, dispute_id)
    order = dispute["orders"]
    refund_amount = float(dispute.get("refund_amount") or 0)
    total_paid = float(order["total_amount"])

    gate = run_refund_checks(
        refund_amount=refund_amount,
        total_paid=total_paid,
        policy_cap_pct=_POLICY_REFUND_CAP_PCT,
        dispute_status=dispute["status"],
        already_refunded=bool(order.get("refund_ref")),
    )

    if not gate.passed:
        log_event(
            db,
            user_id=user_id,
            order_id=order["id"],
            category="refund",
            event_type="refund.blocked",
            actor="Refund Gate",
            status="failed",
            decision="BLOCKED",
            payload=gate.to_dict(),
        )
        return {"ok": False, "checks": gate.to_dict()["checks"], "dispute": dispute}

    # Execute Razorpay refund
    result = payment_provider.create_refund(
        db,
        user_id,
        order["id"],
        refund_amount,
        notes={"dispute_id": dispute_id, "order_id": order["id"]},
    )

    queries.update_order(
        db,
        order["id"],
        {
            "status": "refunded",
            "escrow_status": "refunded",
            "refund_ref": result["provider_reference"],
            "refund_amount": refund_amount,
        },
    )
    updated = queries.update_dispute(
        db,
        dispute_id,
        {"status": "resolved", "refund_ref": result["provider_reference"]},
    )

    log_event(
        db,
        user_id=user_id,
        order_id=order["id"],
        category="refund",
        event_type="refund.completed",
        actor="Payment Provider (test mode)",
        entity=result["provider_reference"],
        decision="REFUND_EXECUTED",
        payload={
            "checks": gate.to_dict()["checks"],
            "provider_ref": result["provider_reference"],
            "refund_amount": refund_amount,
        },
    )
    return {"ok": True, "checks": gate.to_dict()["checks"], "dispute": updated}
