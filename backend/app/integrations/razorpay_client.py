"""
OmniTrust Backend — Razorpay Adapter

Wraps the Razorpay Python SDK behind a clean interface. All Razorpay calls are
test-mode only. The adapter records sanitized request/response metadata in
`audit_events` so judges can see the financial control flow.

SECURITY: The Razorpay key secret is never returned in any API response.
"""
import time
from typing import Any

import razorpay
from supabase import Client

from app.config import get_settings
from app.services.audit_service import log_event
from app.services.idempotency_service import provider_ref


class PaymentProviderUnavailableError(Exception):
    pass


def _client() -> razorpay.Client:
    settings = get_settings()
    if not settings.razorpay_configured:
        raise PaymentProviderUnavailableError(
            "Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)"
        )
    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


class PaymentProvider:
    """Razorpay test-mode adapter implementing the OmniTrust payment interface."""

    def create_virtual_account(
        self,
        db: Client,
        user_id: str,
        order_id: str,
        amount_inr: float,
        currency: str = "INR",
    ) -> dict[str, Any]:
        """
        Create a Razorpay Smart Collect virtual account (test mode).
        Returns sanitized metadata — never the raw Razorpay response with secrets.
        """
        settings = get_settings()
        idem_key = provider_ref("va")
        started = time.monotonic()

        try:
            rz = _client()
            amount_paise = int(amount_inr * 100)
            req_payload: dict = {
                "receivers": {"types": ["bank_account"]},
                "description": f"OmniTrust order {order_id}",
                "amount": amount_paise,
                "currency": currency,
                "close_by": int(time.time()) + 7200,  # 2 hours
                "close_on_accept": True,
            }
            resp = rz.virtual_account.create(req_payload)
            latency_ms = int((time.monotonic() - started) * 1000)

            result = {
                "provider": "razorpay_test",
                "transaction_type": "CREATE_VIRTUAL_ACCOUNT",
                "provider_reference": resp.get("id", idem_key),
                "amount": amount_inr,
                "currency": currency,
                "status": "pending",
                "bank_account": resp.get("receivers", {}).get("bank_account", {}).get("account_number", ""),
                "ifsc": resp.get("receivers", {}).get("bank_account", {}).get("ifsc", ""),
            }
            log_event(
                db,
                user_id=user_id,
                order_id=order_id,
                category="payment",
                event_type="escrow.va_created",
                actor="Razorpay Test Mode",
                entity=result["provider_reference"],
                request_id=idem_key,
                latency_ms=latency_ms,
                decision="VA_CREATED",
                payload={**result, "api_key": "redacted"},
            )
            return result

        except PaymentProviderUnavailableError:
            raise
        except Exception as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            # Fall back to test-mode simulation
            ref = provider_ref("va_sim")
            result = {
                "provider": "razorpay_test_simulated",
                "transaction_type": "CREATE_VIRTUAL_ACCOUNT",
                "provider_reference": ref,
                "amount": amount_inr,
                "currency": currency,
                "status": "simulated",
                "simulation_reason": str(exc),
            }
            log_event(
                db,
                user_id=user_id,
                order_id=order_id,
                category="payment",
                event_type="escrow.va_simulated",
                actor="Razorpay Test Simulator",
                entity=ref,
                request_id=idem_key,
                latency_ms=latency_ms,
                status="warning",
                decision="VA_SIMULATED",
                payload={**result, "sdk_error": str(exc)[:200]},
            )
            return result

    def route_transfer(
        self,
        db: Client,
        user_id: str,
        order_id: str,
        amount_inr: float,
        seller_account: str = "seller_demo_account",
    ) -> dict[str, Any]:
        """
        Route escrow funds to the seller account (Razorpay Route — test mode).
        """
        idem_key = provider_ref("route")
        started = time.monotonic()

        try:
            rz = _client()
            amount_paise = int(amount_inr * 100)
            req_payload: dict = {
                "account": seller_account,
                "amount": amount_paise,
                "currency": "INR",
                "notes": {"order_id": order_id},
            }
            resp = rz.transfer.create(req_payload)
            latency_ms = int((time.monotonic() - started) * 1000)
            ref = resp.get("id", idem_key)
        except Exception as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            ref = provider_ref("route_sim")
            log_event(
                db,
                user_id=user_id,
                order_id=order_id,
                category="settlement",
                event_type="settlement.route_simulated",
                actor="Razorpay Test Simulator",
                entity=ref,
                request_id=idem_key,
                latency_ms=latency_ms,
                status="warning",
                decision="ROUTE_SIMULATED",
                payload={"amount": amount_inr, "sdk_error": str(exc)[:200]},
            )
            return {
                "provider": "razorpay_test_simulated",
                "provider_reference": ref,
                "amount": amount_inr,
                "status": "simulated",
            }

        result = {
            "provider": "razorpay_test",
            "provider_reference": ref,
            "amount": amount_inr,
            "status": "processed",
        }
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="settlement",
            event_type="settlement.route_submitted",
            actor="Razorpay Test Mode",
            entity=ref,
            request_id=idem_key,
            latency_ms=latency_ms,
            decision="SELLER_PAID",
            payload={**result, "api_key": "redacted"},
        )
        return result

    def create_refund(
        self,
        db: Client,
        user_id: str,
        order_id: str,
        amount_inr: float,
        notes: dict | None = None,
    ) -> dict[str, Any]:
        """Create a Razorpay refund (test mode)."""
        idem_key = provider_ref("rfnd")
        started = time.monotonic()

        try:
            rz = _client()
            amount_paise = int(amount_inr * 100)
            req_payload: dict = {
                "amount": amount_paise,
                "notes": notes or {"order_id": order_id},
            }
            # In test mode, we refund against a dummy payment ID
            resp = rz.refund.create({"amount": amount_paise, "payment_id": f"pay_test_{order_id[:8]}"})
            latency_ms = int((time.monotonic() - started) * 1000)
            ref = resp.get("id", idem_key)
        except Exception as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            ref = provider_ref("rfnd_sim")
            log_event(
                db,
                user_id=user_id,
                order_id=order_id,
                category="refund",
                event_type="refund.simulated",
                actor="Razorpay Test Simulator",
                entity=ref,
                request_id=idem_key,
                latency_ms=latency_ms,
                status="warning",
                decision="REFUND_SIMULATED",
                payload={"amount": amount_inr, "sdk_error": str(exc)[:200]},
            )
            return {
                "provider": "razorpay_test_simulated",
                "provider_reference": ref,
                "amount": amount_inr,
                "status": "simulated",
            }

        result = {
            "provider": "razorpay_test",
            "provider_reference": ref,
            "amount": amount_inr,
            "status": "processed",
        }
        log_event(
            db,
            user_id=user_id,
            order_id=order_id,
            category="refund",
            event_type="refund.submitted",
            actor="Razorpay Test Mode",
            entity=ref,
            request_id=idem_key,
            latency_ms=latency_ms,
            decision="REFUND_EXECUTED",
            payload={**result, "api_key": "redacted"},
        )
        return result


# Module-level singleton
payment_provider = PaymentProvider()
