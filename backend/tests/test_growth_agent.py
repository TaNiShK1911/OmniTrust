"""
OmniTrust Backend — Unit Tests: Growth Agent & Gatekeeper
"""
import pytest
from app.agents.growth_agent import _fallback, propose_upsell
from app.services.gatekeeper import run_upsell_checks


class TestGrowthAgentFallback:
    def test_fallback_logic(self):
        proposal, latency = _fallback(agreed_price=1000.0, agreed_quantity=10)
        assert proposal.action == "PROPOSE_UPSELL"
        assert proposal.quantity == 20
        assert proposal.unit_price == 950.0  # 5% off
        assert latency == 0.0


class TestUpsellGatekeeper:
    _base = dict(
        original_quantity=10,
        original_price=1000.0,
        proposed_quantity=20,
        proposed_price=900.0,
        max_discount_pct=20.0,
        stock=100,
        max_order_inr=500_000.0,
    )

    def test_valid_upsell_passes(self):
        res = run_upsell_checks(**self._base)
        assert res.passed
        assert res.rejection_reason is None

    def test_quantity_not_greater_fails(self):
        res = run_upsell_checks(**{**self._base, "proposed_quantity": 10})
        assert not res.passed
        assert "strictly greater" in res.rejection_reason.lower() or "proposed=10" in res.rejection_reason

    def test_exceeds_stock_fails(self):
        res = run_upsell_checks(**{**self._base, "proposed_quantity": 150})
        assert not res.passed

    def test_discount_too_steep_fails(self):
        # max discount 20% -> min price 800. Proposed 700 should fail.
        res = run_upsell_checks(**{**self._base, "proposed_price": 700.0})
        assert not res.passed
        assert "max 20.0% off" in res.rejection_reason

    def test_exceeds_order_cap_fails(self):
        # 20 * 900 = 18,000. Cap at 10,000.
        res = run_upsell_checks(**{**self._base, "max_order_inr": 10000.0})
        assert not res.passed
