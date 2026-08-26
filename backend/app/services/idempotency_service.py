"""
OmniTrust Backend — Idempotency Service

Prevents duplicate financial operations (escrow creation, settlement, refund)
by storing a key → response cache in the `audit_events` table.

Strategy: before executing a financial action, check if a success audit event
with the same idempotency_key (stored as request_id) already exists. If it
does, return the original outcome without re-executing.

This is a lightweight approach that avoids a separate `idempotency_keys` table
while still meeting the demo's idempotency requirements.
"""
from supabase import Client


def check_already_done(
    db: Client,
    *,
    idempotency_key: str,
    event_type: str,
) -> bool:
    """
    Return True if a successful audit event with the given key and type exists.
    Used to suppress duplicate financial actions.
    """
    if not idempotency_key:
        return False
        
    res = (
        db.table("audit_events")
        .select("id")
        .eq("request_id", idempotency_key)
        .eq("event_type", event_type)
        .eq("status", "success")
        .execute()
    )
    return bool(res and res.data and len(res.data) > 0)


def provider_ref(prefix: str) -> str:
    """Generate a pseudo-random provider reference for demo use."""
    import random
    import string

    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"{prefix}_{rand}"
