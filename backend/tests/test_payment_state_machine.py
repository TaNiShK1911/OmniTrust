"""
Unit tests for Payment State Machine and Schemas
"""
from decimal import Decimal
from uuid import uuid4
import pytest
from pydantic import ValidationError

from app.schemas.payments import (
    PaymentState,
    can_transition,
    validate_transition,
    CreatePayPalOrderRequest,
    format_money,
)


class TestPaymentStateMachine:
    def test_happy_path_authorization_to_capture(self):
        """Test full authorization and settlement path."""
        s = PaymentState.PENDING_APPROVAL
        assert can_transition(s, PaymentState.PENDING_AUTHORIZATION)
        s = PaymentState.PENDING_AUTHORIZATION
        assert can_transition(s, PaymentState.FUNDS_AUTHORIZED)
        s = PaymentState.FUNDS_AUTHORIZED
        assert can_transition(s, PaymentState.CAPTURE_PENDING)
        s = PaymentState.CAPTURE_PENDING
        assert can_transition(s, PaymentState.CAPTURED_AND_SETTLED)

    def test_authorization_to_void(self):
        """Uncaptured authorization can be voided."""
        s = PaymentState.FUNDS_AUTHORIZED
        assert can_transition(s, PaymentState.VOID_PENDING)
        assert can_transition(PaymentState.VOID_PENDING, PaymentState.VOIDED)
        assert can_transition(s, PaymentState.VOIDED)

    def test_captured_to_refund(self):
        """Captured funds can be refunded full or partial."""
        s = PaymentState.CAPTURED_AND_SETTLED
        assert can_transition(s, PaymentState.REFUND_PENDING)
        assert can_transition(PaymentState.REFUND_PENDING, PaymentState.REFUNDED)
        assert can_transition(s, PaymentState.PARTIALLY_REFUNDED)
        assert can_transition(PaymentState.PARTIALLY_REFUNDED, PaymentState.REFUNDED)

    def test_authorization_expired(self):
        """Authorization can expire."""
        assert can_transition(PaymentState.FUNDS_AUTHORIZED, PaymentState.AUTHORIZATION_EXPIRED)

    def test_idempotent_self_transition(self):
        """Transitioning to the same state is always allowed."""
        for state in PaymentState:
            assert can_transition(state, state)
            validate_transition(state, state)

    def test_forbidden_transitions(self):
        """Terminal states cannot resurrect or perform illegal leaps."""
        # Cannot capture from PENDING_APPROVAL
        assert not can_transition(PaymentState.PENDING_APPROVAL, PaymentState.CAPTURED_AND_SETTLED)
        with pytest.raises(ValueError, match="Illegal payment state transition"):
            validate_transition(PaymentState.PENDING_APPROVAL, PaymentState.CAPTURED_AND_SETTLED)

        # Cannot capture from VOIDED
        assert not can_transition(PaymentState.VOIDED, PaymentState.CAPTURE_PENDING)
        assert not can_transition(PaymentState.VOIDED, PaymentState.CAPTURED_AND_SETTLED)

        # Cannot un-refund
        assert not can_transition(PaymentState.REFUNDED, PaymentState.CAPTURED_AND_SETTLED)
        assert not can_transition(PaymentState.REFUNDED, PaymentState.FUNDS_AUTHORIZED)

        # Cannot capture expired authorization
        assert not can_transition(PaymentState.AUTHORIZATION_EXPIRED, PaymentState.CAPTURED_AND_SETTLED)


class TestPaymentSchemas:
    def test_valid_create_order_request(self):
        req = CreatePayPalOrderRequest(
            order_id=uuid4(),
            amount=Decimal("150.50"),
            currency="USD",
        )
        assert req.amount == Decimal("150.50")
        assert req.currency == "USD"
        assert format_money(req.amount) == "150.50"

    def test_negative_or_zero_amount_rejected(self):
        with pytest.raises(ValidationError):
            CreatePayPalOrderRequest(
                order_id=uuid4(),
                amount=Decimal("0.00"),
                currency="USD",
            )

        with pytest.raises(ValidationError):
            CreatePayPalOrderRequest(
                order_id=uuid4(),
                amount=Decimal("-10.00"),
                currency="USD",
            )

    def test_unsupported_currency_rejected(self):
        with pytest.raises(ValidationError):
            CreatePayPalOrderRequest(
                order_id=uuid4(),
                amount=Decimal("100.00"),
                currency="XYZ",
            )

    def test_decimal_precision_quantization(self):
        req = CreatePayPalOrderRequest(
            order_id=uuid4(),
            amount=Decimal("99.999"),  # quantizes to 100.00
            currency="usd",
        )
        assert req.amount == Decimal("100.00")
        assert req.currency == "USD"
