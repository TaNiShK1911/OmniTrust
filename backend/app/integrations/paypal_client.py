"""
OmniTrust Backend — PayPal REST Integration Client

Supports PayPal Sandbox Orders v2 (intent=AUTHORIZE), Payments v2 (capture, void, refund),
OAuth2 token caching with expiration skew and locking, idempotency with PayPal-Request-Id,
and official webhook signature verification via /v1/notifications/verify-webhook-signature.

SECURITY:
- Client secrets and Bearer tokens are NEVER logged or returned in responses.
- Amounts are strictly handled as Decimal values and formatted to 2 decimal places.
"""
import asyncio
from decimal import Decimal
import logging
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("omnitrust.paypal")


class PayPalError(Exception):
    """Sanitized PayPal API error."""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_name: str = "PAYPAL_ERROR",
        details: list[dict[str, Any]] | None = None,
        debug_id: str | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_name = error_name
        self.details = details or []
        self.debug_id = debug_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.error_name,
            "message": self.message,
            "status_code": self.status_code,
            "debug_id": self.debug_id,
            "details": self.details,
        }


class PayPalClient:
    """Async client for PayPal Orders v2 and Payments v2 Sandbox APIs."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        base_url: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._client_id = client_id
        self._client_secret = client_secret
        self._base_url = base_url
        self._transport = transport
        self._token: str | None = None
        self._token_expires_at: float = 0.0
        self._lock = asyncio.Lock()
        self._http_client: httpx.AsyncClient | None = None

    def _get_config(self) -> tuple[str, str, str]:
        settings = get_settings()
        cid = self._client_id or settings.paypal_client_id
        secret = self._client_secret or settings.paypal_client_secret
        url = (self._base_url or settings.paypal_base_url).rstrip("/")
        return cid, secret, url

    async def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                transport=self._transport,
                timeout=httpx.Timeout(20.0, connect=5.0),
            )
        return self._http_client

    async def close(self) -> None:
        """Close underlying HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    async def get_access_token(self, force_refresh: bool = False) -> str:
        """
        Retrieve cached OAuth2 access token or obtain a new one using Client Credentials.
        Protected by asyncio.Lock to avoid token stampede.
        """
        async with self._lock:
            now = time.time()
            # 60s skew margin
            if not force_refresh and self._token and (self._token_expires_at - now > 60):
                return self._token

            cid, secret, base_url = self._get_config()
            if not cid or not secret:
                raise PayPalError(
                    "PayPal credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing)",
                    status_code=503,
                    error_name="CONFIGURATION_MISSING",
                )

            client = await self._get_http_client()
            try:
                resp = await client.post(
                    f"{base_url}/v1/oauth2/token",
                    auth=(cid, secret),
                    data={"grant_type": "client_credentials"},
                    headers={"Accept": "application/json", "Accept-Language": "en_US"},
                )
            except httpx.RequestError as exc:
                logger.error("Network error requesting PayPal OAuth token: %s", type(exc).__name__)
                raise PayPalError(
                    "Failed to connect to PayPal OAuth service",
                    status_code=502,
                    error_name="NETWORK_ERROR",
                ) from exc

            if resp.status_code != 200:
                logger.error("PayPal OAuth failure status=%s", resp.status_code)
                raise PayPalError(
                    "Failed to authenticate with PayPal",
                    status_code=resp.status_code,
                    error_name="AUTHENTICATION_FAILURE",
                )

            data = resp.json()
            access_token = data.get("access_token")
            expires_in = int(data.get("expires_in", 3600))
            if not access_token:
                raise PayPalError("Malformed OAuth response from PayPal", status_code=502)

            self._token = access_token
            self._token_expires_at = now + expires_in
            return self._token

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        request_id: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """
        Execute an authenticated request against PayPal REST API with error sanitization.
        """
        token = await self.get_access_token()
        _, _, base_url = self._get_config()
        client = await self._get_http_client()

        req_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
        }
        if request_id:
            req_headers["PayPal-Request-Id"] = request_id
        if headers:
            req_headers.update(headers)

        url = f"{base_url}{path}"
        try:
            resp = await client.request(
                method=method,
                url=url,
                json=json,
                headers=req_headers,
            )
        except httpx.RequestError as exc:
            logger.error("PayPal request connection error to %s: %s", path, type(exc).__name__)
            raise PayPalError(
                f"Communication error with PayPal API at {path}",
                status_code=504,
                error_name="PROVIDER_TIMEOUT",
            ) from exc

        if resp.status_code in (200, 201, 202):
            return resp.json() if resp.content else {}
        elif resp.status_code == 204:
            return {}

        # Parse error payload
        debug_id = resp.headers.get("PayPal-Debug-Id")
        try:
            err_json = resp.json()
            err_name = err_json.get("name") or err_json.get("error") or "PAYPAL_API_ERROR"
            err_msg = err_json.get("message") or err_json.get("error_description") or resp.text[:200]
            err_details = err_json.get("details", [])
        except Exception:
            err_name = "PAYPAL_API_ERROR"
            err_msg = resp.text[:200]
            err_details = []

        logger.warning(
            "PayPal API non-success status=%s path=%s name=%s debug_id=%s",
            resp.status_code,
            path,
            err_name,
            debug_id,
        )
        raise PayPalError(
            message=err_msg,
            status_code=resp.status_code,
            error_name=err_name,
            details=err_details,
            debug_id=debug_id,
        )

    async def create_order_authorization(
        self,
        *,
        amount: Decimal,
        currency: str,
        order_id: str,
        request_id: str,
    ) -> dict[str, Any]:
        """
        Create a PayPal order with intent=AUTHORIZE.
        Does NOT capture money; creates an order awaiting buyer approval.
        """
        settings = get_settings()
        formatted_amount = format(amount.quantize(Decimal("0.01")), ".2f")
        payload = {
            "intent": "AUTHORIZE",
            "purchase_units": [
                {
                    "reference_id": order_id,
                    "custom_id": order_id,
                    "invoice_id": order_id[:127],
                    "amount": {
                        "currency_code": currency.upper(),
                        "value": formatted_amount,
                    },
                }
            ],
            "application_context": {
                "return_url": settings.paypal_return_url,
                "cancel_url": settings.paypal_cancel_url,
                "user_action": "PAY_NOW",
            },
        }
        return await self.request(
            "POST",
            "/v2/checkout/orders",
            json=payload,
            request_id=request_id,
        )

    async def authorize_order(self, paypal_order_id: str, request_id: str) -> dict[str, Any]:
        """
        Authorize the payment for an approved order.
        Returns the authorization object inside purchase_units[0].payments.authorizations[0].
        """
        return await self.request(
            "POST",
            f"/v2/checkout/orders/{paypal_order_id}/authorize",
            json={},
            request_id=request_id,
        )

    async def capture_authorization(
        self,
        authorization_id: str,
        request_id: str,
        amount: Decimal | None = None,
        currency: str | None = None,
        final_capture: bool = True,
    ) -> dict[str, Any]:
        """
        Capture an authorized payment via Payments v2 POST /v2/payments/authorizations/{id}/capture.
        """
        payload: dict[str, Any] = {"final_capture": final_capture}
        if amount is not None and currency is not None:
            payload["amount"] = {
                "currency_code": currency.upper(),
                "value": format(amount.quantize(Decimal("0.01")), ".2f"),
            }
        return await self.request(
            "POST",
            f"/v2/payments/authorizations/{authorization_id}/capture",
            json=payload,
            request_id=request_id,
        )

    async def void_authorization(self, authorization_id: str, request_id: str) -> dict[str, Any]:
        """
        Void an authorized payment (all-or-nothing).
        """
        return await self.request(
            "POST",
            f"/v2/payments/authorizations/{authorization_id}/void",
            json={},
            request_id=request_id,
        )

    async def refund_capture(
        self,
        capture_id: str,
        request_id: str,
        amount: Decimal | None = None,
        currency: str | None = None,
        note_to_payer: str | None = None,
    ) -> dict[str, Any]:
        """
        Refund a captured payment via Payments v2 POST /v2/payments/captures/{id}/refund.
        """
        payload: dict[str, Any] = {}
        if amount is not None and currency is not None:
            payload["amount"] = {
                "currency_code": currency.upper(),
                "value": format(amount.quantize(Decimal("0.01")), ".2f"),
            }
        if note_to_payer:
            payload["note_to_payer"] = note_to_payer[:255]

        return await self.request(
            "POST",
            f"/v2/payments/captures/{capture_id}/refund",
            json=payload,
            request_id=request_id,
        )

    async def verify_webhook_signature(
        self,
        *,
        transmission_id: str,
        transmission_time: str,
        cert_url: str,
        auth_algo: str,
        transmission_sig: str,
        webhook_id: str,
        webhook_event: dict[str, Any],
    ) -> bool:
        """
        Call PayPal's official POST /v1/notifications/verify-webhook-signature endpoint.
        Returns True if verification_status == 'SUCCESS'.
        """
        payload = {
            "transmission_id": transmission_id,
            "transmission_time": transmission_time,
            "cert_url": cert_url,
            "auth_algo": auth_algo,
            "transmission_sig": transmission_sig,
            "webhook_id": webhook_id,
            "webhook_event": webhook_event,
        }
        try:
            resp = await self.request(
                "POST",
                "/v1/notifications/verify-webhook-signature",
                json=payload,
            )
            status = resp.get("verification_status")
            return status == "SUCCESS"
        except Exception as exc:
            logger.warning("PayPal webhook verification call failed: %s", exc)
            return False


# Global default client
paypal_client = PayPalClient()
