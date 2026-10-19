"""
OmniTrust Backend — Payment Schemas and State Machine

Defines canonical application payment states, legal transitions,
and strictly typed Pydantic models with Decimal amounts for money safety.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PaymentState(str, Enum):
    """Canonical application payment states (independent of raw provider strings)."""
    PENDING_APPROVAL = "PENDING_APPROVAL"
    PENDING_AUTHORIZATION = "PENDING_AUTHORIZATION"
    FUNDS_AUTHORIZED = "FUNDS_AUTHORIZED"
    CAPTURE_PENDING = "CAPTURE_PENDING"
    CAPTURED_AND_SETTLED = "CAPTURED_AND_SETTLED"
    VOID_PENDING = "VOID_PENDING"
    VOIDED = "VOIDED"
    REFUND_PENDING = "REFUND_PENDING"
    REFUNDED = "REFUNDED"
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"
    AUTHORIZATION_EXPIRED = "AUTHORIZATION_EXPIRED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    DISPUTED = "DISPUTED"


# Legal state transitions map
VALID_TRANSITIONS: dict[PaymentState, set[PaymentState]] = {
    PaymentState.PENDING_APPROVAL: {
        PaymentState.PENDING_AUTHORIZATION,
        PaymentState.VOIDED,
        PaymentState.PAYMENT_FAILED,
    },
    PaymentState.PENDING_AUTHORIZATION: {
        PaymentState.FUNDS_AUTHORIZED,
        PaymentState.PAYMENT_FAILED,
    },
    PaymentState.FUNDS_AUTHORIZED: {
        PaymentState.CAPTURE_PENDING,
        PaymentState.VOID_PENDING,
        PaymentState.VOIDED,
        PaymentState.AUTHORIZATION_EXPIRED,
        PaymentState.DISPUTED,
    },
    PaymentState.CAPTURE_PENDING: {
        PaymentState.CAPTURED_AND_SETTLED,
        PaymentState.PAYMENT_FAILED,
        PaymentState.DISPUTED,
    },
    PaymentState.CAPTURED_AND_SETTLED: {
        PaymentState.REFUND_PENDING,
        PaymentState.REFUNDED,
        PaymentState.PARTIALLY_REFUNDED,
        PaymentState.DISPUTED,
    },
    PaymentState.VOID_PENDING: {
        PaymentState.VOIDED,
        PaymentState.PAYMENT_FAILED,
    },
    PaymentState.VOIDED: set(),  # Terminal
    PaymentState.REFUND_PENDING: {
        PaymentState.REFUNDED,
        PaymentState.PARTIALLY_REFUNDED,
        PaymentState.PAYMENT_FAILED,
    },
    PaymentState.REFUNDED: set(),  # Terminal
    PaymentState.PARTIALLY_REFUNDED: {
        PaymentState.REFUND_PENDING,
        PaymentState.REFUNDED,
        PaymentState.DISPUTED,
    },
    PaymentState.AUTHORIZATION_EXPIRED: set(),  # Terminal
    PaymentState.PAYMENT_FAILED: {
        # Can retry approval / creation
        PaymentState.PENDING_APPROVAL,
    },
    PaymentState.DISPUTED: {
        PaymentState.VOID_PENDING,
        PaymentState.VOIDED,
        PaymentState.REFUND_PENDING,
        PaymentState.REFUNDED,
        PaymentState.PARTIALLY_REFUNDED,
        PaymentState.CAPTURED_AND_SETTLED,
    },
}


def can_transition(from_state: PaymentState, to_state: PaymentState) -> bool:
    """Return True if transition from `from_state` to `to_state` is legal."""
    if from_state == to_state:
        return True  # Idempotent re-assertion
    return to_state in VALID_TRANSITIONS.get(from_state, set())


def validate_transition(from_state: PaymentState, to_state: PaymentState) -> None:
    """Raise ValueError if transition is illegal."""
    if not can_transition(from_state, to_state):
        raise ValueError(
            f"Illegal payment state transition from {from_state.value} to {to_state.value}"
        )


def format_money(val: Decimal) -> str:
    """Format decimal to exactly 2 decimal places."""
    return format(val.quantize(Decimal("0.01")), ".2f")


class CreatePayPalOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: UUID
    amount: Decimal
    currency: str = Field(default="USD", min_length=3, max_length=3)

    @field_validator("amount")
    @classmethod
    def validate_positive_amount(cls, v: Decimal) -> Decimal:
        if v <= Decimal("0"):
            raise ValueError("Amount must be strictly positive")
        if not v.is_finite():
            raise ValueError("Amount must be finite")
        return v.quantize(Decimal("0.01"))

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v_upper = v.upper()
        allowed = {"USD", "EUR", "GBP", "CAD", "AUD", "INR"}
        if v_upper not in allowed:
            raise ValueError(f"Currency {v} not in supported currencies: {allowed}")
        return v_upper


class CreatePayPalOrderResponse(BaseModel):
    order_id: UUID
    paypal_order_id: str
    approval_url: str
    state: PaymentState
    amount: str
    currency: str


class AuthorizePayPalOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: UUID
    paypal_order_id: str


class PaymentTransactionResponse(BaseModel):
    id: UUID | str
    order_id: UUID | str
    provider: str
    paypal_order_id: str | None = None
    authorization_id: str | None = None
    capture_id: str | None = None
    last_refund_id: str | None = None
    amount: str
    currency: str
    state: PaymentState
    provider_order_status: str | None = None
    authorization_expires_at: datetime | None = None
    idempotency_key: str
    created_at: datetime
    updated_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class CapturePaymentResponse(BaseModel):
    ok: bool
    order_id: UUID | str
    capture_id: str | None = None
    state: PaymentState
    checks: list[dict[str, Any]] = Field(default_factory=list)
    message: str | None = None


class VoidPaymentResponse(BaseModel):
    ok: bool
    order_id: UUID | str
    authorization_id: str | None = None
    state: PaymentState
    message: str | None = None


class RefundPaymentResponse(BaseModel):
    ok: bool
    order_id: UUID | str
    refund_id: str | None = None
    state: PaymentState
    refund_amount: str
    message: str | None = None
