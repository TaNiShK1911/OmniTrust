"""
OmniTrust Backend — Negotiation Service

Orchestrates the full negotiation lifecycle:
  create_session → run_next_turn (up to 4 times) → approve → cancel

The AI agents propose; the gatekeeper decides; this service persists state.
"""
import json
import random
import string
from datetime import datetime, timezone

from supabase import Client

from app.agents import buyer_agent, seller_agent
from app.config import get_settings
from app.db import queries
from app.services.audit_service import Timer, log_event
from app.services.gatekeeper import run_negotiation_checks
from app.services.idempotency_service import provider_ref


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_session(
    db: Client,
    *,
    user_id: str,
    product_id: str,
    quantity: int,
    buyer_message: str,
) -> dict:
    """Validate inputs, create a negotiation session, write opening audit event."""
    settings = get_settings()

    product = queries.get_product(db, product_id)
    list_price = float(product["list_price"])
    stock = int(product["stock"])

    if quantity <= 0:
        raise ValueError("quantity must be positive")
    if quantity > stock:
        raise ValueError(f"Requested quantity {quantity} exceeds stock {stock}")
    total = list_price * quantity
    if total > settings.max_order_value_inr:
        raise ValueError(
            f"Total order value ₹{total:,.0f} exceeds cap ₹{settings.max_order_value_inr:,.0f}"
        )

    # Buyer target: derived from buyer_message or default 15% off
    target = round(list_price * 0.85)

    negotiation = queries.create_negotiation(
        db,
        {
            "user_id": user_id,
            "product_id": product_id,
            "quantity": quantity,
            "buyer_target": target,
            "max_turns": settings.negotiation_max_turns,
            "status": "active",
            "turns": [],
        },
    )

    log_event(
        db,
        user_id=user_id,
        negotiation_id=negotiation["id"],
        category="guardrail",
        event_type="negotiation.opened",
        actor="System",
        entity=product["sku"],
        decision="BOUNDS_SET",
        payload={
            "list_price": list_price,
            "buyer_target": target,
            "price_floor": "redacted",
            "max_turns": settings.negotiation_max_turns,
            "quantity": quantity,
            "buyer_message": buyer_message[:200],
        },
    )
    return negotiation


def run_next_turn(db: Client, *, session_id: str, user_id: str) -> dict:
    """
    Execute one full turn cycle:
      1. Buyer agent proposes
      2. Gatekeeper validates
      3. If accepted → seller responds (accept or counter)
      4. Persist all turns and audit events
      5. Return updated negotiation
    """
    settings = get_settings()
    neg = queries.get_negotiation(db, session_id)
    product = neg["product"]

    if neg["status"] != "active":
        raise ValueError(f"Negotiation {session_id} is not active (status={neg['status']})")

    turns: list[dict] = neg.get("turns") or []
    turn_number = int(neg["turn_count"]) + 1
    if turn_number > int(neg["max_turns"]):
        raise ValueError("Turn budget exhausted")

    list_price = float(product["list_price"])
    price_floor = float(product["price_floor"])
    stock = int(product["stock"])
    quantity = int(neg["quantity"])
    buyer_target = float(neg["buyer_target"])
    max_turns = int(neg["max_turns"])

    # Last seller price — use list_price on turn 1
    last_seller = next(
        (t for t in reversed(turns) if t.get("actor") == "seller_agent"),
        None,
    )
    last_seller_price = float(last_seller["proposed_unit_price"]) if last_seller else list_price

    now = _now()

    # ── Step 1: Buyer agent proposal ─────────────────────────────────────────
    with Timer() as t_buyer:
        buyer_proposal, buyer_latency, buyer_ai_used, buyer_error = buyer_agent.buyer_propose(
            product_name=product["name"],
            list_price=list_price,
            quantity=quantity,
            buyer_target=buyer_target,
            last_seller_price=last_seller_price,
            turn=turn_number,
        )

    buyer_turn: dict = {
        "turn": turn_number,
        "actor": "buyer_agent",
        "message": buyer_proposal.message,
        "proposed_unit_price": buyer_proposal.unit_price,
        "action": buyer_proposal.action,
        "at": now,
    }
    turns.append(buyer_turn)

    log_event(
        db,
        user_id=user_id,
        negotiation_id=session_id,
        category="ai",
        event_type="buyer_agent.proposal",
        actor="Buyer Agent",
        entity=product["sku"],
        status="warning" if buyer_error else "success",
        latency_ms=int(buyer_latency * 1000),
        request_id=provider_ref("req"),
        decision="PROPOSED",
        payload={
            "model": settings.groq_model if buyer_ai_used else "deterministic-fallback",
            "ai_used": buyer_ai_used,
            "proposed_unit_price": buyer_proposal.unit_price,
            "action": buyer_proposal.action,
            "rationale": buyer_proposal.message,
            "provider_error": buyer_error,
        },
    )

    # ── Step 2: Gatekeeper ────────────────────────────────────────────────────
    gate = run_negotiation_checks(
        action=buyer_proposal.action,
        unit_price=buyer_proposal.unit_price,
        quantity=buyer_proposal.quantity,
        turn=turn_number,
        session_status=neg["status"],
        price_floor=price_floor,
        list_price=list_price,
        stock=stock,
        max_turns=max_turns,
        max_order_inr=settings.max_order_value_inr,
    )

    gate_turn: dict = {
        "turn": turn_number,
        "actor": "gatekeeper",
        "message": (
            "Proposal satisfies every deterministic policy check."
            if gate.passed
            else f"Proposal blocked: {gate.rejection_reason}"
        ),
        "decision": "accepted" if gate.passed else "rejected",
        "checks": gate.to_dict()["checks"],
        "at": now,
    }
    turns.append(gate_turn)

    log_event(
        db,
        user_id=user_id,
        negotiation_id=session_id,
        category="guardrail",
        event_type="gatekeeper.decision",
        actor="Gatekeeper",
        entity=product["sku"],
        status="success" if gate.passed else "failed",
        decision="ACCEPTED" if gate.passed else "REJECTED",
        payload={
            "checks": gate.to_dict()["checks"],
            "evaluated_unit_price": buyer_proposal.unit_price,
            "rejection_reason": gate.rejection_reason,
        },
    )

    # ── Step 3: Seller response ───────────────────────────────────────────────
    new_status = neg["status"]
    agreed_price: float | None = None

    if gate.passed:
        # Buyer ACCEPT or gatekeeper-approved PROPOSE → seller decides
        seller_resp, seller_latency, seller_ai_used, seller_error = seller_agent.seller_respond(
            product_name=product["name"],
            list_price=list_price,
            price_floor=price_floor,
            quantity=quantity,
            last_seller_price=last_seller_price,
            buyer_proposed=buyer_proposal.unit_price,
            turn=turn_number,
        )

        seller_turn: dict = {
            "turn": turn_number,
            "actor": "seller_agent",
            "message": seller_resp.message,
            "proposed_unit_price": seller_resp.unit_price,
            "action": seller_resp.action,
            "decision": "accepted" if seller_resp.action == "ACCEPT" else "counter",
            "at": now,
        }
        turns.append(seller_turn)

        log_event(
            db,
            user_id=user_id,
            negotiation_id=session_id,
            category="ai",
            event_type="seller_agent.response",
            actor="Seller Agent",
            entity=product["sku"],
            status="warning" if seller_error else "success",
            latency_ms=int(seller_latency * 1000),
            decision=seller_resp.action,
            payload={
                "model": settings.groq_model if seller_ai_used else "deterministic-fallback",
                "ai_used": seller_ai_used,
                "proposed_unit_price": seller_resp.unit_price,
                "action": seller_resp.action,
                "rationale": seller_resp.message,
            },
        )

        if seller_resp.action == "ACCEPT":
            new_status = "agreed"
            agreed_price = seller_resp.unit_price
            log_event(
                db,
                user_id=user_id,
                negotiation_id=session_id,
                category="guardrail",
                event_type="negotiation.agreed",
                actor="System",
                entity=product["sku"],
                decision="CONSENSUS_REACHED",
                payload={"agreed_unit_price": agreed_price, "quantity": quantity},
            )
    else:
        # Gatekeeper rejected — seller counters deterministically
        counter = round((price_floor + last_seller_price) / 2)
        seller_turn = {
            "turn": turn_number,
            "actor": "seller_agent",
            "message": f"Proposal rejected by policy. Counter-offer at ₹{counter}.",
            "proposed_unit_price": counter,
            "action": "PROPOSE",
            "decision": "counter",
            "at": now,
        }
        turns.append(seller_turn)

    # ── Step 4: Expire if turn budget exhausted ───────────────────────────────
    if turn_number >= max_turns and new_status == "active":
        new_status = "expired"
        log_event(
            db,
            user_id=user_id,
            negotiation_id=session_id,
            category="guardrail",
            event_type="negotiation.expired",
            actor="System",
            status="failed",
            decision="TURN_BUDGET_EXHAUSTED",
            payload={"turns_used": turn_number, "max_turns": max_turns},
        )

    updated = queries.update_negotiation(
        db,
        session_id,
        {
            "turn_count": turn_number,
            "turns": turns,
            "status": new_status,
            "agreed_unit_price": agreed_price,
        },
    )
    return {
        "negotiation": updated,
        "gatekeeper_passed": gate.passed,
        "ai_error": buyer_error,
    }


def approve_session(db: Client, *, session_id: str, user_id: str) -> dict:
    """Human confirmation: convert agreed negotiation into an order."""
    neg = queries.get_negotiation(db, session_id)
    if neg["status"] != "agreed" or not neg.get("agreed_unit_price"):
        raise ValueError("Negotiation has not reached consensus")

    # Idempotency: return existing order if already created
    existing = queries.get_order_by_negotiation(db, session_id)
    if existing:
        return {"order_id": existing["id"], "already_existed": True}

    product = neg["product"]
    unit_price = float(neg["agreed_unit_price"])
    quantity = int(neg["quantity"])
    total = unit_price * quantity

    order = queries.create_order(
        db,
        {
            "user_id": user_id,
            "negotiation_id": session_id,
            "product_id": product["id"],
            "product_name": product["name"],
            "quantity": quantity,
            "unit_price": unit_price,
            "total_amount": total,
            "currency": product.get("currency", "INR"),
            "status": "awaiting_escrow",
            "idempotency_key": provider_ref("idem"),
        },
    )

    queries.update_negotiation(db, session_id, {"status": "approved"})

    log_event(
        db,
        user_id=user_id,
        order_id=order["id"],
        negotiation_id=session_id,
        category="guardrail",
        event_type="order.created",
        actor="System",
        entity=order["id"],
        decision="CONSENSUS_APPROVED",
        payload={
            "unit_price": unit_price,
            "quantity": quantity,
            "total_amount": total,
            "product": product["name"],
        },
    )
    return {"order_id": order["id"], "already_existed": False}


def cancel_session(db: Client, *, session_id: str, user_id: str) -> dict:
    neg = queries.get_negotiation(db, session_id)
    if neg["status"] in ("approved", "agreed"):
        raise ValueError("Cannot cancel a session that has already been approved")
    queries.update_negotiation(db, session_id, {"status": "cancelled"})
    log_event(
        db,
        user_id=user_id,
        negotiation_id=session_id,
        category="guardrail",
        event_type="negotiation.cancelled",
        actor="User",
        decision="CANCELLED",
        payload={},
    )
    return {"cancelled": True}
