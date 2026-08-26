"""
OmniTrust Backend — Seller Agent

Asks Groq to produce a seller-side response (counter-offer or accept).
The seller agent never proposes below the price floor — but the gatekeeper
is the authoritative enforcement layer, not this prompt.

Falls back to a deterministic midpoint if Groq is unavailable.
"""
import math

from app.agents.schemas import AgentProposal
from app.config import get_settings
from app.integrations.groq_client import GroqUnavailableError, call_groq_structured

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
    "You are a Seller Agent in a B2B negotiation. "
    "You must not reveal the exact price floor to the buyer. "
    "You may counter-offer at or above the floor, or accept if the buyer's proposal is acceptable. "
    "Reply ONLY with the JSON schema provided. No extra text outside JSON. "
    "The message must be under 200 characters."
)


def _fallback(
    *,
    price_floor: float,
    last_seller_price: float,
    buyer_proposed: float,
    quantity: int,
) -> tuple[AgentProposal, float]:
    """
    Deterministic seller response:
    - Accept if buyer_proposed >= floor
    - Counter at midpoint of floor and current ask otherwise
    """
    if buyer_proposed >= price_floor:
        return (
            AgentProposal(
                action="ACCEPT",
                unit_price=buyer_proposed,
                quantity=quantity,
                message=f"Proposal of ₹{buyer_proposed} accepted. Terms agreed.",
            ),
            0.0,
        )
    counter = round((price_floor + last_seller_price) / 2)
    return (
        AgentProposal(
            action="PROPOSE",
            unit_price=counter,
            quantity=quantity,
            message=f"Counter-offer at ₹{counter} per unit.",
        ),
        0.0,
    )


def seller_respond(
    *,
    product_name: str,
    list_price: float,
    price_floor: float,
    quantity: int,
    last_seller_price: float,
    buyer_proposed: float,
    turn: int,
) -> tuple[AgentProposal, float, bool, str | None]:
    """
    Generate a seller agent response.

    Returns (proposal, latency_seconds, ai_used, error_message_or_None).
    """
    settings = get_settings()
    max_turns = settings.negotiation_max_turns

    user_prompt = (
        f"Product: {product_name}. "
        f"List price: ₹{list_price:,.2f}. "
        f"Your minimum acceptable price (floor): ₹{price_floor:,.2f}. "
        f"Your current offer: ₹{last_seller_price:,.2f}. "
        f"Buyer's latest proposal: ₹{buyer_proposed:,.2f} per unit. "
        f"Quantity: {quantity}. Turn {turn} of {max_turns}. "
        "If the buyer's proposal meets or exceeds the floor, ACCEPT. "
        "Otherwise PROPOSE a counter-offer between the floor and your current ask."
    )

    try:
        raw, latency = call_groq_structured(
            system_prompt=_SYSTEM,
            user_prompt=user_prompt,
            json_schema=_SCHEMA,
            model=settings.groq_model,
        )
        proposal = AgentProposal(**raw)
        if not math.isfinite(proposal.unit_price) or proposal.unit_price <= 0:
            raise ValueError("LLM returned non-positive price")
        return proposal, latency, True, None
    except GroqUnavailableError as exc:
        fallback, latency = _fallback(
            price_floor=price_floor,
            last_seller_price=last_seller_price,
            buyer_proposed=buyer_proposed,
            quantity=quantity,
        )
        return fallback, latency, False, str(exc)
    except Exception as exc:
        fallback, latency = _fallback(
            price_floor=price_floor,
            last_seller_price=last_seller_price,
            buyer_proposed=buyer_proposed,
            quantity=quantity,
        )
        return fallback, latency, False, f"Schema parse error: {exc}"
