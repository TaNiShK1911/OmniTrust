"""
OmniTrust Backend — Settlement Service

Releases funds by capturing authorized payment after delivery verification.
The settlement gate is the authoritative check.
"""
import asyncio
import concurrent.futures
from typing import Any

from supabase import Client

from app.services import payment_service


def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor() as executor:
        return executor.submit(asyncio.run, coro).result()


async def settle_order_async(db: Client, *, order_id: str, user_id: str) -> dict[str, Any]:
    return await payment_service.capture_order(db, order_id=order_id, user_id=user_id)


def settle_order(db: Client, *, order_id: str, user_id: str) -> dict[str, Any]:
    """Sync compatibility wrapper for capture_order."""
    return _run_async(settle_order_async(db, order_id=order_id, user_id=user_id))
