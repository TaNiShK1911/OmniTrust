from decimal import Decimal

import pytest

from app.services.payment_currency import settlement_terms


def test_inr_order_converts_to_auditable_usd_settlement_amount():
    terms = settlement_terms(
        source_amount=Decimal("4250.00"),
        source_currency="INR",
        settlement_currency="USD",
        inr_to_usd_rate=Decimal("0.012"),
    )
    assert terms.source_amount == Decimal("4250.00")
    assert terms.settlement_amount == Decimal("51.00")
    assert terms.source_currency == "INR"
    assert terms.settlement_currency == "USD"
    assert terms.conversion_rate == Decimal("0.012")


def test_same_currency_does_not_apply_a_conversion_rate():
    terms = settlement_terms(
        source_amount=Decimal("1.005"),
        source_currency="USD",
        settlement_currency="USD",
        inr_to_usd_rate=None,
    )
    assert terms.settlement_amount == Decimal("1.01")
    assert terms.conversion_rate is None


@pytest.mark.parametrize(
    ("source_currency", "target_currency", "rate"),
    [
        ("INR", "USD", None),
        ("INR", "USD", Decimal("0")),
        ("EUR", "USD", Decimal("1.1")),
    ],
)
def test_unapproved_or_unconfigured_conversions_are_rejected(source_currency, target_currency, rate):
    with pytest.raises(ValueError):
        settlement_terms(
            source_amount=Decimal("100"),
            source_currency=source_currency,
            settlement_currency=target_currency,
            inr_to_usd_rate=rate,
        )
