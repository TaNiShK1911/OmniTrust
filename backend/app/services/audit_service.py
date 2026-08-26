"""
OmniTrust Backend — Audit Service

Centralised helper for writing immutable audit events. All material state
transitions write at least one audit row so the judge-facing timeline
is always complete and inspectable.
"""
import time
from typing import Any

from supabase import Client

from app.db import queries


def log_event(
    db: Client,
    *,
    user_id: str,
    category: str,
    event_type: str,
    actor: str,
    order_id: str | None = None,
    negotiation_id: str | None = None,
    entity: str = "",
    status: str = "success",
    decision: str | None = None,
    latency_ms: int | None = None,
    request_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """
    Insert one audit event. Failures are swallowed (logged to stderr) so a
    broken audit insert never aborts a financial transaction.
    """
    try:
        queries.insert_audit_event(
            db,
            {
                "user_id": user_id,
                "order_id": order_id,
                "negotiation_id": negotiation_id,
                "category": category,
                "event_type": event_type,
                "actor": actor,
                "entity": entity,
                "status": status,
                "decision": decision,
                "latency_ms": latency_ms,
                "request_id": request_id,
                "payload": payload or {},
            },
        )
    except Exception as exc:  # pragma: no cover
        import sys
        print(f"[AUDIT] insert failed: {exc}", file=sys.stderr)


class Timer:
    """Context manager that measures elapsed milliseconds."""

    def __init__(self) -> None:
        self._start: float = 0.0
        self.ms: int = 0

    def __enter__(self) -> "Timer":
        self._start = time.monotonic()
        return self

    def __exit__(self, *_: Any) -> None:
        self.ms = int((time.monotonic() - self._start) * 1000)
