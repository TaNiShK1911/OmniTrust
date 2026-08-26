"""
OmniTrust Backend — Arbitrator Agent

Calls Groq to produce a dispute resolution recommendation for a damaged-goods
claim. The agent returns a RECOMMENDATION — it cannot execute a refund.
The deterministic refund gate (`refund_service.py`) enforces the policy caps.

Falls back to a deterministic 30 % partial refund if Groq is unavailable.
"""
import math

from app.agents.schemas import ArbitratorDecision
from app.config import get_settings
from app.integrations.groq_client import GroqUnavailableError, call_groq_structured

_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "decision": {
            "type": "string",
            "enum": ["FULL_REFUND", "PARTIAL_REFUND", "NO_REFUND"],
        },
        "penalty_percent": {"type": "number"},
        "refund_amount": {"type": "number"},
        "reason_code": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["decision", "penalty_percent", "refund_amount", "reason_code", "confidence"],
    "additionalProperties": False,
}

_SYSTEM = (
    "You are an impartial Arbitrator Agent for a B2B e-commerce dispute. "
    "You receive a damaged-goods claim and must recommend a fair refund amount. "
    "You CANNOT execute the refund — that is done by a separate deterministic policy gate. "
    "Reply ONLY with the JSON schema. No text outside JSON. "
    "confidence must be between 0 and 1. penalty_percent must be between 0 and 100. "
    "refund_amount must be between 0 and the total_paid amount."
)

_DETERMINISTIC_PENALTY_PCT = 30


def _fallback(total_paid: float) -> tuple[ArbitratorDecision, float]:
    refund = round(total_paid * _DETERMINISTIC_PENALTY_PCT / 100, 2)
    return (
        ArbitratorDecision(
            decision="PARTIAL_REFUND",
            penalty_percent=_DETERMINISTIC_PENALTY_PCT,
            refund_amount=refund,
            reason_code="DAMAGED_GOODS",
            confidence=0.91,
        ),
        0.0,
    )


def arbitrate(
    *,
    order_id: str,
    total_paid: float,
    shipment_status: str,
    goods_condition: str,
    dispute_reason: str,
    policy_refund_cap_pct: float = 60.0,
) -> tuple[ArbitratorDecision, float, bool, str | None]:
    """
    Run arbitration on a dispute.

    Returns (decision, latency_seconds, ai_used, error_or_None).
    The returned decision is always bounded by policy_refund_cap_pct — even the
    AI recommendation is clipped before being returned so downstream callers
    never see an uncapped value.
    """
    settings = get_settings()
    max_refund = round(total_paid * policy_refund_cap_pct / 100, 2)

    user_prompt = (
        f"Order ID: {order_id}. "
        f"Total paid: ₹{total_paid:,.2f}. "
        f"Shipment status: {shipment_status}. "
        f"Goods condition: {goods_condition}. "
        f"Dispute reason: {dispute_reason}. "
        f"Policy: maximum refund is {policy_refund_cap_pct}% of total paid (₹{max_refund:,.2f}). "
        "Recommend a fair resolution. "
        "If the damage is clearly the carrier's fault, recommend PARTIAL_REFUND of 30-60%. "
        "If goods are completely destroyed, you may recommend FULL_REFUND up to the policy cap. "
        "If no evidence of damage, recommend NO_REFUND."
    )

    try:
        raw, latency = call_groq_structured(
            system_prompt=_SYSTEM,
            user_prompt=user_prompt,
            json_schema=_SCHEMA,
            model=settings.groq_arb_model,
            temperature=0.05,
            max_tokens=400,
        )
        decision = ArbitratorDecision(**raw)
        # Enforce policy cap on the AI recommendation (belt-and-suspenders)
        if not math.isfinite(decision.refund_amount) or decision.refund_amount < 0:
            raise ValueError("AI returned invalid refund_amount")
        decision.refund_amount = min(round(decision.refund_amount, 2), max_refund)
        return decision, latency, True, None
    except GroqUnavailableError as exc:
        fb, latency = _fallback(total_paid)
        fb.refund_amount = min(fb.refund_amount, max_refund)
        return fb, latency, False, str(exc)
    except Exception as exc:
        fb, latency = _fallback(total_paid)
        fb.refund_amount = min(fb.refund_amount, max_refund)
        return fb, latency, False, f"Schema parse error: {exc}"
