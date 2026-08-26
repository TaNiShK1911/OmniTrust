"""
OmniTrust Backend — Deterministic Gatekeeper

Pure Python validation functions that are the ONLY authority on whether an AI
agent proposal is allowed to proceed. These run AFTER the agent and BEFORE any
state mutation or financial action.

Design principles:
  - No I/O, no network calls, no database access — fully unit-testable in isolation
  - Every check returns a label, pass boolean, and detail string for the audit log
  - Any single failing check blocks the proposal — the agent cannot override
  - All business-rule constants come from function arguments, not global state
"""
from dataclasses import dataclass, field


@dataclass
class GateCheck:
    label: str
    passed: bool
    detail: str


@dataclass
class GatekeeperResult:
    passed: bool
    checks: list[GateCheck] = field(default_factory=list)
    rejection_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "checks": [
                {"label": c.label, "pass": c.passed, "detail": c.detail}
                for c in self.checks
            ],
            "rejection_reason": self.rejection_reason,
        }


# ── Individual checks (pure functions) ───────────────────────────────────────


def check_action_type(action: str) -> GateCheck:
    valid = {"PROPOSE", "ACCEPT", "REJECT"}
    ok = action in valid
    return GateCheck(
        label="Action type is valid",
        passed=ok,
        detail=f"action={action}" if ok else f"unknown action '{action}', expected one of {valid}",
    )


def check_price_positive(unit_price: float) -> GateCheck:
    import math
    ok = math.isfinite(unit_price) and unit_price > 0
    return GateCheck(
        label="Proposed price is a positive finite number",
        passed=ok,
        detail=f"proposed ₹{unit_price}",
    )


def check_price_floor(unit_price: float, price_floor: float) -> GateCheck:
    ok = unit_price >= price_floor
    return GateCheck(
        label="Proposed price ≥ seller price floor",
        passed=ok,
        detail=f"proposed ₹{unit_price} vs floor ₹{price_floor}"
        if ok
        else f"VIOLATION: ₹{unit_price} < floor ₹{price_floor}",
    )


def check_price_ceiling(unit_price: float, list_price: float) -> GateCheck:
    ok = unit_price <= list_price
    return GateCheck(
        label="Proposed price ≤ list price",
        passed=ok,
        detail=f"proposed ₹{unit_price} vs list ₹{list_price}",
    )


def check_quantity(quantity: int, stock: int) -> GateCheck:
    ok = 0 < quantity <= stock
    return GateCheck(
        label="Quantity within available stock",
        passed=ok,
        detail=f"qty={quantity}, stock={stock}"
        if ok
        else f"VIOLATION: qty={quantity} exceeds stock={stock}" if quantity > stock else "qty must be positive",
    )


def check_total_order_cap(unit_price: float, quantity: int, max_inr: float) -> GateCheck:
    total = unit_price * quantity
    ok = total <= max_inr
    return GateCheck(
        label=f"Total order ≤ configured cap (₹{max_inr:,.0f})",
        passed=ok,
        detail=f"total ₹{total:,.2f}"
        if ok
        else f"VIOLATION: total ₹{total:,.2f} > cap ₹{max_inr:,.2f}",
    )


def check_turn_count(turn: int, max_turns: int) -> GateCheck:
    ok = 1 <= turn <= max_turns
    return GateCheck(
        label=f"Turn within budget (max {max_turns})",
        passed=ok,
        detail=f"turn={turn}, max={max_turns}"
        if ok
        else f"VIOLATION: turn={turn} exceeds max={max_turns}",
    )


def check_session_active(status: str) -> GateCheck:
    ok = status == "active"
    return GateCheck(
        label="Negotiation session is active",
        passed=ok,
        detail=f"status={status}"
        if ok
        else f"VIOLATION: cannot advance terminal session (status={status})",
    )


def check_idempotency(already_processed: bool) -> GateCheck:
    return GateCheck(
        label="No duplicate action",
        passed=not already_processed,
        detail="no duplicate" if not already_processed else "VIOLATION: action already processed",
    )


# ── Composite gatekeeper runs ─────────────────────────────────────────────────


def run_negotiation_checks(
    *,
    action: str,
    unit_price: float,
    quantity: int,
    turn: int,
    session_status: str,
    price_floor: float,
    list_price: float,
    stock: int,
    max_turns: int,
    max_order_inr: float,
) -> GatekeeperResult:
    """
    Run all negotiation proposal checks in order.
    Returns immediately after the first failure (short-circuit).
    """
    checks = [
        check_session_active(session_status),
        check_turn_count(turn, max_turns),
        check_action_type(action),
        check_price_positive(unit_price),
        check_price_floor(unit_price, price_floor),
        check_price_ceiling(unit_price, list_price),
        check_quantity(quantity, stock),
        check_total_order_cap(unit_price, quantity, max_order_inr),
    ]

    failures = [c for c in checks if not c.passed]
    if failures:
        return GatekeeperResult(
            passed=False,
            checks=checks,
            rejection_reason=failures[0].detail,
        )
    return GatekeeperResult(passed=True, checks=checks)


def run_refund_checks(
    *,
    refund_amount: float,
    total_paid: float,
    policy_cap_pct: float,
    dispute_status: str,
    already_refunded: bool,
) -> GatekeeperResult:
    """Policy gate for executing a refund."""
    cap = round(total_paid * policy_cap_pct / 100, 2)
    checks = [
        GateCheck(
            label="Refund ≤ amount paid",
            passed=refund_amount <= total_paid,
            detail=f"refund ₹{refund_amount} vs paid ₹{total_paid}",
        ),
        GateCheck(
            label=f"Refund ≤ policy cap ({policy_cap_pct}%)",
            passed=refund_amount <= cap,
            detail=f"refund ₹{refund_amount} vs cap ₹{cap}",
        ),
        GateCheck(
            label="Dispute awaiting resolution",
            passed=dispute_status == "arbitrated",
            detail=f"dispute_status={dispute_status}",
        ),
        GateCheck(
            label="No existing successful refund",
            passed=not already_refunded,
            detail="no prior refund" if not already_refunded else "VIOLATION: refund already recorded",
        ),
    ]
    failures = [c for c in checks if not c.passed]
    if failures:
        return GatekeeperResult(
            passed=False,
            checks=checks,
            rejection_reason=failures[0].detail,
        )
    return GatekeeperResult(passed=True, checks=checks)


def run_settlement_checks(
    *,
    order_status: str,
    escrow_status: str,
    shipment_delivered: bool,
    dispute_open: bool,
    already_settled: bool,
) -> GatekeeperResult:
    """Policy gate for executing settlement (releasing escrow to seller)."""
    checks = [
        GateCheck(
            label="Order is in delivered state",
            passed=order_status in ("delivered", "settled"),
            detail=f"order_status={order_status}",
        ),
        GateCheck(
            label="Escrow funds are held",
            passed=escrow_status == "held",
            detail=f"escrow_status={escrow_status}",
        ),
        GateCheck(
            label="Shipment confirmed delivered",
            passed=shipment_delivered,
            detail="logistics event confirmed",
        ),
        GateCheck(
            label="No open dispute",
            passed=not dispute_open,
            detail="no dispute" if not dispute_open else "VIOLATION: open dispute blocks settlement",
        ),
        GateCheck(
            label="Not already settled",
            passed=not already_settled,
            detail="no prior settlement" if not already_settled else "VIOLATION: already settled",
        ),
    ]
    failures = [c for c in checks if not c.passed]
    if failures:
        return GatekeeperResult(
            passed=False,
            checks=checks,
            rejection_reason=failures[0].detail,
        )
    return GatekeeperResult(passed=True, checks=checks)
