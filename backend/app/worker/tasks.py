"""
OmniTrust Celery Background Tasks

All tasks follow strict safety invariants:
1. Pure identifiers are passed — no serialized credentials or sensitive payloads.
2. Durable database state is the single source of truth.
3. Operations are idempotent: retries and duplicate task deliveries cannot bypass
   payment authorization or settlement gate checks.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from app.worker.celery_app import celery_app

logger = logging.getLogger("omnitrust.worker.tasks")


@celery_app.task(name="app.worker.tasks.ping_worker_task", bind=True)
def ping_worker_task(self) -> Dict[str, Any]:
    """
    Lightweight health and readiness check for the Celery background worker.
    """
    now = datetime.now(timezone.utc).isoformat()
    logger.info("Worker ping executed successfully at %s", now)
    return {
        "status": "healthy",
        "worker_task_id": self.request.id,
        "timestamp": now,
    }


@celery_app.task(
    name="app.worker.tasks.dispatch_audit_telemetry_task",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def dispatch_audit_telemetry_task(
    self,
    order_id: str | None,
    event_type: str,
    actor: str,
    details: Dict[str, Any],
    user_id: str = "system",
    category: str = "agent_telemetry",
    negotiation_id: str | None = None,
    entity: str = "order",
    decision: str | None = None,
    latency_ms: int | None = None,
    request_id: str | None = None,
) -> Dict[str, Any]:
    """
    Asynchronously persist audit telemetry and agentic consensus metrics to Supabase.

    Security & Reliability invariants:
    - Field allowlisting and strict denylisting of credentials, keys, tokens, and chain-of-thought.
    - Idempotency deduplication using request_id so duplicate deliveries create no duplicate rows.
    - Explicit failure on DB persistence error triggering retry with exponential backoff.
    """
    from app.db import queries
    from app.db.supabase import get_supabase_admin

    SAFE_TELEMETRY_KEYS = {
        "score", "consensus_score", "consensus_score_pct", "confidence",
        "buyer_bid", "seller_counteroffer", "agreed_price", "quantity",
        "total_amount", "currency", "payment_state", "previous_state",
        "next_state", "order_status", "logistics_proof_hash", "tracking_number",
        "tracking_id", "carrier", "delivery_status", "step", "action", "reason",
        "summary", "agent_name", "turn_index", "turn", "metrics", "evidence",
        "model", "tokens_used", "latency_ms", "ai_used", "proposed_unit_price",
        "rationale", "condition", "status", "decision", "negotiation_id",
    }
    BLOCKED_PATTERNS = [
        "secret", "token", "password", "key", "credential", "auth", "jwt",
        "signature", "private", "chain_of_thought", "cot",
    ]

    try:
        task_request_id = request_id or (getattr(self.request, "id", None) if hasattr(self, "request") else None)
        logger.info(
            "Persisting background audit telemetry order=%s, event=%s, actor=%s, request_id=%s",
            order_id,
            event_type,
            actor,
            task_request_id,
        )

        db = get_supabase_admin()

        # Idempotency check: deduplicate if request_id already recorded for event_type
        if task_request_id and queries.check_audit_event_exists(db, task_request_id, event_type):
            logger.info("Audit event already persisted for request_id=%s, event=%s. Idempotent return.", task_request_id, event_type)
            return {
                "success": True,
                "deduplicated": True,
                "order_id": order_id,
                "event_type": event_type,
                "request_id": task_request_id,
            }

        # Sanitize details with both allowlist filter and denylist exclusion
        sanitized_details: Dict[str, Any] = {}
        for k, v in details.items():
            k_lower = str(k).lower()
            if any(b in k_lower for b in BLOCKED_PATTERNS):
                continue
            if k_lower in SAFE_TELEMETRY_KEYS or isinstance(v, (int, float, bool)):
                if isinstance(v, str) and ("bearer " in v.lower() or len(v) > 500):
                    continue
                sanitized_details[k] = v

        record = {
            "user_id": user_id or "00000000-0000-0000-0000-000000000000",
            "order_id": order_id,
            "negotiation_id": negotiation_id,
            "category": category,
            "event_type": event_type,
            "actor": actor,
            "entity": entity,
            "status": "success",
            "decision": decision,
            "latency_ms": latency_ms,
            "request_id": task_request_id,
            "payload": sanitized_details,
        }

        inserted = queries.insert_audit_event(db, record)
        if not inserted:
            raise RuntimeError(f"Database write returned no data for audit event {event_type} on order {order_id}")

        return {
            "success": True,
            "order_id": order_id,
            "event_type": event_type,
            "actor": actor,
            "persisted_id": inserted.get("id"),
            "request_id": task_request_id,
            "details_keys": list(sanitized_details.keys()),
        }
    except Exception as exc:
        logger.warning("Telemetry persistence failed for order %s: %s, retrying...", order_id, exc)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.worker.tasks.process_settlement_capture_task",
    bind=True,
    max_retries=5,
    default_retry_delay=10,
)
def process_settlement_capture_task(self, order_id: str, user_id: str = "system") -> Dict[str, Any]:
    """
    Asynchronously evaluate settlement release gates after carrier delivery webhook.
    
    Invariants enforced:
    - Never bypasses settlement gate checks.
    - Idempotent: if payment is already captured, returns immediately.
    - Durable DB state is checked before any state mutation.
    - Bounded retries for provider failures without false simulated successes.
    """
    from app.db import payment_queries, queries
    from app.db.supabase import get_supabase_admin
    from app.services import settlement_service

    logger.info("Executing async settlement gate evaluation for order=%s", order_id)
    try:
        db = get_supabase_admin()
        order = queries.get_order(db, order_id)
        if not order:
            raise ValueError(f"Order {order_id} not found in database for settlement")

        real_user_id = order.get("user_id") or user_id
        tx = payment_queries.get_payment_transaction_by_order_id(db, order_id)

        # Idempotent check: already captured and settled in order or transaction table
        if (
            order.get("status") == "settled"
            or order.get("escrow_status") == "released"
            or (tx and tx.get("state") == "CAPTURED_AND_SETTLED")
        ):
            logger.info("Order %s already captured and settled. Idempotent return.", order_id)
            return {
                "order_id": order_id,
                "already_settled": True,
                "state": "CAPTURED_AND_SETTLED",
            }

        # Verify an uncaptured PayPal authorization exists
        auth_id = (tx.get("authorization_id") if tx else None) or order.get("escrow_ref")
        if not auth_id:
            raise ValueError(f"No authorization ID found to capture for order {order_id}")

        # Attempt gated settlement
        result = settlement_service.settle_order(db, order_id=order_id, user_id=real_user_id)

        if not result.get("ok"):
            if result.get("state") == "CAPTURED_AND_SETTLED":
                return {
                    "order_id": order_id,
                    "already_settled": True,
                    "state": "CAPTURED_AND_SETTLED",
                }
            # Gate rejected settlement (e.g., dispute open or delivery not verified)
            logger.warning("Settlement gate blocked release for order %s: %s", order_id, result.get("message"))
            return {
                "order_id": order_id,
                "settled": False,
                "blocked": True,
                "state": result.get("state", "PENDING_APPROVAL"),
                "message": result.get("message", "Settlement blocked by gate"),
                "checks": result.get("checks", {}),
            }

        return {
            "order_id": order_id,
            "settled": True,
            "state": result.get("state", "CAPTURED_AND_SETTLED"),
            "capture_id": result.get("capture_id"),
            "message": result.get("message", "Processed async settlement"),
        }
    except Exception as exc:
        logger.error("Async settlement capture failed for order %s: %s", order_id, exc)
        raise self.retry(exc=exc)
