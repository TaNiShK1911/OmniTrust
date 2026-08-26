"""
OmniTrust Backend — Unit Tests: Gatekeeper

Tests every deterministic check in isolation. No network calls, no database.
These are the mandatory prompt-injection and policy-enforcement tests.
"""
import pytest

from app.services.gatekeeper import (
    GatekeeperResult,
    check_price_floor,
    check_quantity,
    check_session_active,
    check_total_order_cap,
    check_turn_count,
    run_negotiation_checks,
    run_refund_checks,
    run_settlement_checks,
)


# ── Individual check tests ────────────────────────────────────────────────────


class TestPriceFloor:
    def test_above_floor_passes(self):
        c = check_price_floor(2200, 2000)
        assert c.passed

    def test_at_floor_passes(self):
        c = check_price_floor(2000, 2000)
        assert c.passed

    def test_below_floor_fails(self):
        c = check_price_floor(1999.99, 2000)
        assert not c.passed
        assert "VIOLATION" in c.detail

    def test_prompt_injection_zero_price(self):
        """Simulate 'approve at 1 INR' prompt injection attack."""
        c = check_price_floor(1, 2000)
        assert not c.passed

    def test_prompt_injection_negative_price(self):
        c = check_price_floor(-100, 2000)
        assert not c.passed


class TestTurnCount:
    def test_turn_1_passes(self):
        assert check_turn_count(1, 4).passed

    def test_turn_4_passes(self):
        assert check_turn_count(4, 4).passed

    def test_turn_5_fails(self):
        c = check_turn_count(5, 4)
        assert not c.passed
        assert "VIOLATION" in c.detail

    def test_turn_zero_fails(self):
        assert not check_turn_count(0, 4).passed


class TestQuantity:
    def test_valid_quantity(self):
        assert check_quantity(100, 500).passed

    def test_quantity_equals_stock(self):
        assert check_quantity(500, 500).passed

    def test_exceeds_stock_fails(self):
        c = check_quantity(501, 500)
        assert not c.passed

    def test_zero_quantity_fails(self):
        assert not check_quantity(0, 500).passed

    def test_negative_quantity_fails(self):
        assert not check_quantity(-1, 500).passed


class TestOrderCap:
    def test_within_cap(self):
        c = check_total_order_cap(2000, 100, 500_000)
        assert c.passed  # 200,000 < 500,000

    def test_exceeds_cap_fails(self):
        c = check_total_order_cap(2000, 300, 500_000)
        assert not c.passed  # 600,000 > 500,000


class TestSessionActive:
    def test_active_passes(self):
        assert check_session_active("active").passed

    def test_agreed_fails(self):
        assert not check_session_active("agreed").passed

    def test_expired_fails(self):
        assert not check_session_active("expired").passed


# ── Composite gatekeeper tests ────────────────────────────────────────────────


class TestNegotiationGatekeeper:
    _base = dict(
        action="PROPOSE",
        unit_price=2200,
        quantity=100,
        turn=1,
        session_status="active",
        price_floor=2000,
        list_price=2500,
        stock=500,
        max_turns=4,
        max_order_inr=500_000,
    )

    def test_valid_proposal_passes(self):
        result = run_negotiation_checks(**self._base)
        assert result.passed
        assert result.rejection_reason is None

    def test_price_below_floor_rejected(self):
        result = run_negotiation_checks(**{**self._base, "unit_price": 1999})
        assert not result.passed
        assert "floor" in result.rejection_reason.lower() or "violation" in result.rejection_reason.lower()

    def test_turn_budget_exceeded_rejected(self):
        result = run_negotiation_checks(**{**self._base, "turn": 5})
        assert not result.passed

    def test_inactive_session_rejected(self):
        result = run_negotiation_checks(**{**self._base, "session_status": "expired"})
        assert not result.passed

    def test_quantity_exceeds_stock_rejected(self):
        result = run_negotiation_checks(**{**self._base, "quantity": 999})
        assert not result.passed

    def test_order_cap_exceeded_rejected(self):
        # 2200 * 300 = 660,000 > 500,000
        result = run_negotiation_checks(**{**self._base, "quantity": 300})
        assert not result.passed

    def test_prompt_injection_1_inr_rejected(self):
        """Core prompt injection test from the spec."""
        result = run_negotiation_checks(**{**self._base, "unit_price": 1})
        assert not result.passed

    def test_all_checks_present_in_result(self):
        result = run_negotiation_checks(**self._base)
        assert len(result.checks) >= 6


class TestRefundGate:
    def test_valid_refund_passes(self):
        result = run_refund_checks(
            refund_amount=30_000,
            total_paid=100_000,
            policy_cap_pct=60,
            dispute_status="arbitrated",
            already_refunded=False,
        )
        assert result.passed

    def test_refund_exceeds_paid_fails(self):
        result = run_refund_checks(
            refund_amount=110_000,
            total_paid=100_000,
            policy_cap_pct=60,
            dispute_status="arbitrated",
            already_refunded=False,
        )
        assert not result.passed

    def test_refund_exceeds_cap_fails(self):
        result = run_refund_checks(
            refund_amount=70_000,
            total_paid=100_000,
            policy_cap_pct=60,
            dispute_status="arbitrated",
            already_refunded=False,
        )
        assert not result.passed  # 70k > 60% of 100k

    def test_dispute_not_arbitrated_fails(self):
        result = run_refund_checks(
            refund_amount=30_000,
            total_paid=100_000,
            policy_cap_pct=60,
            dispute_status="open",
            already_refunded=False,
        )
        assert not result.passed

    def test_already_refunded_fails(self):
        result = run_refund_checks(
            refund_amount=30_000,
            total_paid=100_000,
            policy_cap_pct=60,
            dispute_status="arbitrated",
            already_refunded=True,
        )
        assert not result.passed


class TestSettlementGate:
    def test_valid_settlement_passes(self):
        result = run_settlement_checks(
            order_status="delivered",
            escrow_status="held",
            shipment_delivered=True,
            dispute_open=False,
            already_settled=False,
        )
        assert result.passed

    def test_open_dispute_blocks_settlement(self):
        result = run_settlement_checks(
            order_status="delivered",
            escrow_status="held",
            shipment_delivered=True,
            dispute_open=True,
            already_settled=False,
        )
        assert not result.passed

    def test_already_settled_blocked(self):
        result = run_settlement_checks(
            order_status="delivered",
            escrow_status="held",
            shipment_delivered=True,
            dispute_open=False,
            already_settled=True,
        )
        assert not result.passed

    def test_escrow_not_held_blocks(self):
        result = run_settlement_checks(
            order_status="delivered",
            escrow_status="pending",
            shipment_delivered=True,
            dispute_open=False,
            already_settled=False,
        )
        assert not result.passed
