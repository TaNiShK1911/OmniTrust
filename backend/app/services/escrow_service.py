"""
OmniTrust Backend — Escrow Service

Creates and queries PayPal authorization state for an order.
Integrates with payment_service for Orders v2 and Payments v2.
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


async def create_payment_order_async(db: Client, *, order_id: str, user_id: str) -> dict[str, Any]:
    return await payment_service.create_payment_order(db, order_id=order_id, user_id=user_id)


async def authorize_payment_async(
    db: Client, *, order_id: str, paypal_order_id: str, user_id: str
) -> dict[str, Any]:
    return await payment_service.authorize_payment(
        db, order_id=order_id, paypal_order_id=paypal_order_id, user_id=user_id
    )


def create_escrow(db: Client, *, order_id: str, user_id: str) -> dict[str, Any]:
    """Sync compatibility wrapper for create_payment_order."""
    return _run_async(create_payment_order_async(db, order_id=order_id, user_id=user_id))


def get_escrow_status(db: Client, order_id: str) -> dict[str, Any]:
    """Sync status lookup."""
    return payment_service.get_payment_status(db, order_id=order_id)
