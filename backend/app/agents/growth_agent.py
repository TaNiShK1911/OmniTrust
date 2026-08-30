"""
OmniTrust Backend — Growth Agent

Proposes an upsell (quantity-break discount or cross-sell) when a deal is agreed.
Falls back to a deterministic calculation if Groq is unavailable.
"""
import math
from app.agents.schemas import AgentProposal
from app.config import get_settings
from app.integrations.groq_client import GroqUnavailableError, call_groq_structured

_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["PROPOSE_UPSELL", "NO_UPSELL"]},
        "unit_price": {"type": "number"},
        "quantity": {"type": "integer"},
        "message": {"type": "string"},
    },
    "required": ["action", "unit_price", "quantity", "message"],
    "additionalProperties": False,
}

_SYSTEM = (
    "You are a Growth Agent responsible for increasing order value through upsells. "
    "A negotiation has just reached an agreement. Propose a single, compelling "
    "quantity-break discount (e.g., '+20% quantity for X% off unit price'). "
    "Reply ONLY with the JSON schema provided. "
    "If an upsell is not viable, return NO_UPSELL. "
    "Do NOT propose a price below 1."
)


def _fallback(
    *,
    agreed_price: float,
    agreed_quantity: int,
) -> tuple[AgentProposal, float]:
    """Deterministic fallback — offer 5% off if they double the quantity."""
    new_price = max(1, round(agreed_price * 0.95))
    new_qty = agreed_quantity * 2
    
    proposal = AgentProposal(
        action="PROPOSE_UPSELL",
        unit_price=new_price,
        quantity=new_qty,
        message=f"Deterministic fallback: Double your quantity to {new_qty} and get 5% off (₹{new_price}/unit).",
    )
    return proposal, 0.0


def propose_upsell(
    *,
    product_name: str,
    agreed_price: float,
    agreed_quantity: int,
) -> tuple[AgentProposal, float, bool, str | None]:
    """
    Generate an upsell proposal.
    Returns (proposal, latency_seconds, ai_used, error_message_or_None).
    """
    settings = get_settings()

    user_prompt = (
        f"Product: {product_name}. "
        f"Agreed deal: {agreed_quantity} units at ₹{agreed_price:,.2f}/unit. "
        "Propose a higher quantity with a slightly lower unit price to incentivize a larger total order value. "
    )

    try:
        raw, latency = call_groq_structured(
            system_prompt=_SYSTEM,
            user_prompt=user_prompt,
            json_schema=_SCHEMA,
            model=settings.groq_model,
        )
        proposal = AgentProposal(**raw)
        
        if proposal.action == "PROPOSE_UPSELL":
            if not math.isfinite(proposal.unit_price) or proposal.unit_price <= 0:
                raise ValueError("LLM returned non-positive price")
            if not math.isfinite(proposal.quantity) or proposal.quantity <= agreed_quantity:
                raise ValueError("LLM returned quantity not greater than agreed")
                
        return proposal, latency, True, None
    except GroqUnavailableError as exc:
        fallback, latency = _fallback(
            agreed_price=agreed_price,
            agreed_quantity=agreed_quantity,
        )
        return fallback, latency, False, str(exc)
    except Exception as exc:
        fallback, latency = _fallback(
            agreed_price=agreed_price,
            agreed_quantity=agreed_quantity,
        )
        return fallback, latency, False, f"Schema parse error: {exc}"
