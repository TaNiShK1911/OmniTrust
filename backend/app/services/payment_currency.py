"""Canonical server-side settlement-currency conversion for PayPal payments."""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class SettlementTerms:
    """The source order value and the exact value sent to the payment provider."""

    source_amount: Decimal
    source_currency: str
    settlement_amount: Decimal
    settlement_currency: str
    conversion_rate: Decimal | None = None


def settlement_terms(
    *,
    source_amount: Decimal,
    source_currency: str,
    settlement_currency: str,
    inr_to_usd_rate: Decimal | None,
) -> SettlementTerms:
    """Convert an order amount only for the explicitly configured INR/USD path.

    This deliberately does not consult a public exchange-rate API at checkout. The
    configured rate is a reviewed, auditable settlement rate and is persisted with
    the resulting payment transaction.
    """
    if source_amount <= 0 or not source_amount.is_finite():
        raise ValueError("Payment amount must be finite and strictly positive")

    source = source_currency.upper()
    target = settlement_currency.upper()
    if source == target:
        return SettlementTerms(
            source_amount=source_amount,
            source_currency=source,
            settlement_amount=source_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            settlement_currency=target,
        )

    if source != "INR" or target != "USD":
        raise ValueError(
            f"No approved PayPal settlement conversion is configured for {source} to {target}"
        )
    if inr_to_usd_rate is None or inr_to_usd_rate <= 0 or not inr_to_usd_rate.is_finite():
        raise ValueError("PAYPAL_INR_TO_USD_RATE must be a positive decimal for INR-to-USD settlement")

    settlement_amount = (source_amount * inr_to_usd_rate).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    if settlement_amount <= 0:
        raise ValueError("Converted PayPal settlement amount must be at least 0.01 USD")

    return SettlementTerms(
        source_amount=source_amount,
        source_currency=source,
        settlement_amount=settlement_amount,
        settlement_currency=target,
        conversion_rate=inr_to_usd_rate,
    )
