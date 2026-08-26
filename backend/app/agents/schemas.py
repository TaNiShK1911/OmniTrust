"""
OmniTrust Backend — Agent I/O Schemas

Pydantic models for all agent proposals and decisions. Using strict models
ensures the gatekeeper always receives well-typed inputs rather than raw dicts.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AgentProposal(BaseModel):
    """
    Output schema for both the Buyer Agent and Seller Agent.
    The LLM is instructed to respond with exactly this structure.
    """

    action: Literal["PROPOSE", "ACCEPT", "REJECT"]
    unit_price: float = Field(gt=0, description="Proposed unit price in INR")
    quantity: int = Field(gt=0, description="Requested quantity")
    message: str = Field(max_length=300, description="Human-readable rationale")

    @field_validator("unit_price")
    @classmethod
    def price_must_be_finite(cls, v: float) -> float:
        import math

        if not math.isfinite(v):
            raise ValueError("unit_price must be a finite number")
        return round(v, 2)


class ArbitratorDecision(BaseModel):
    """
    Output schema for the Arbitrator Agent.
    This is a RECOMMENDATION only — the deterministic refund gate decides
    whether to execute. The agent cannot trigger financial actions directly.
    """

    decision: Literal["FULL_REFUND", "PARTIAL_REFUND", "NO_REFUND"]
    penalty_percent: float = Field(ge=0, le=100)
    refund_amount: float = Field(ge=0)
    reason_code: str
    confidence: float = Field(ge=0.0, le=1.0)

    @field_validator("refund_amount")
    @classmethod
    def refund_must_be_finite(cls, v: float) -> float:
        import math

        if not math.isfinite(v):
            raise ValueError("refund_amount must be a finite number")
        return round(v, 2)


class GatekeeperCheck(BaseModel):
    label: str
    pass_: bool = Field(alias="pass")
    detail: str

    class Config:
        populate_by_name = True


class GatekeeperResult(BaseModel):
    passed: bool
    checks: list[GatekeeperCheck]
    rejection_reason: str | None = None
