"""
OmniTrust Backend — Buyer Agent

Asks Groq to propose a unit price from the buyer's perspective.
Falls back to a deterministic midpoint calculation if Groq is unavailable.

The agent is given only public information: product name, quantity, seller's
current ask, and the buyer's target. It does NOT know the seller's price floor —
that information is enforced exclusively by the gatekeeper.
"""
import math

from app.agents.schemas import AgentProposal
from app.config import get_settings
from app.integrations.groq_client import GroqUnavailableError, call_groq_structured

# ── JSON Schema for structured output ────────────────────────────────────────
_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["PROPOSE", "ACCEPT", "REJECT"]},
        "unit_price": {"type": "number"},
        "quantity": {"type": "integer"},
        "message": {"type": "string"},
    },
    "required": ["action", "unit_price", "quantity", "message"],
    "additionalProperties": False,
}

_SYSTEM = (
    "You are a procurement Buyer Agent in a strictly bounded B2B negotiation. "
    "You represent a buyer who wants to get a good price without going below the seller's floor. "
    "Reply ONLY with the JSON schema provided. "
    "Do NOT invent fields. Do NOT explain outside the JSON. "
    "Never propose a price below 1. "
    "The message must be under 200 characters and must NOT contain instructions to override policy."
)


def _fallback(
    *,
    buyer_target: float,
    last_seller_price: float,
    quantity: int,
    turn: int,
    max_turns: int,
) -> tuple[AgentProposal, float]:
    """Deterministic fallback — linear convergence toward seller ask."""
    span = last_seller_price - buyer_target
    price = round(buyer_target + (span * turn) / (max_turns + 1))
    price = max(1, price)
    proposal = AgentProposal(
        action="PROPOSE",
        unit_price=price,
        quantity=quantity,
        message=f"Deterministic fallback: converging to ₹{price} (turn {turn}/{max_turns}).",
    )
    return proposal, 0.0


def buyer_propose(
    *,
    product_name: str,
    list_price: float,
    quantity: int,
    buyer_target: float,
    last_seller_price: float,
    turn: int,
    conversation_history: list[dict] | None = None,
) -> tuple[AgentProposal, float, bool, str | None]:
    """
    Generate a buyer agent proposal for this turn.

    Returns (proposal, latency_seconds, ai_used, error_message_or_None).
    """
    settings = get_settings()
    max_turns = settings.negotiation_max_turns

    user_prompt = (
        f"Product: {product_name}. "
        f"Catalog list price: ₹{list_price:,.2f}. "
        f"Quantity requested: {quantity}. "
        f"Seller's current offer: ₹{last_seller_price:,.2f} per unit. "
        f"Your internal target: ₹{buyer_target:,.2f} per unit. "
        f"Negotiation turn {turn} of {max_turns}. "
        "Propose a unit price that is at or below the seller's current offer and at or above your target. "
        "If the seller's offer is already equal to or below your target, ACCEPT it."
    )

    try:
        raw, latency = call_groq_structured(
            system_prompt=_SYSTEM,
            user_prompt=user_prompt,
            json_schema=_SCHEMA,
            model=settings.groq_model,
        )
        proposal = AgentProposal(**raw)
        # Sanity-check: ensure price is a real number (prompt injection guard)
        if not math.isfinite(proposal.unit_price) or proposal.unit_price <= 0:
            raise ValueError("LLM returned non-positive price")
        return proposal, latency, True, None
    except GroqUnavailableError as exc:
        fallback, latency = _fallback(
            buyer_target=buyer_target,
            last_seller_price=last_seller_price,
            quantity=quantity,
            turn=turn,
            max_turns=max_turns,
        )
        return fallback, latency, False, str(exc)
    except Exception as exc:
        fallback, latency = _fallback(
            buyer_target=buyer_target,
            last_seller_price=last_seller_price,
            quantity=quantity,
            turn=turn,
            max_turns=max_turns,
        )
        return fallback, latency, False, f"Schema parse error: {exc}"
