"""
Unit tests for PayPal REST client using httpx.MockTransport.
"""
from decimal import Decimal
import json
import pytest
import httpx

from app.integrations.paypal_client import PayPalClient, PayPalError


@pytest.fixture
def mock_paypal():
    def _create_client(handler):
        transport = httpx.MockTransport(handler)
        client = PayPalClient(
            client_id="test_client_id",
            client_secret="test_client_secret",
            base_url="https://api-m.sandbox.paypal.com",
            transport=transport,
        )
        return client
    return _create_client


@pytest.mark.asyncio
async def test_oauth_token_caching(mock_paypal):
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        if request.url.path == "/v1/oauth2/token":
            call_count += 1
            assert request.headers.get("authorization", "").startswith("Basic ")
            return httpx.Response(
                200,
                json={"access_token": "mock_token_abc", "expires_in": 3600},
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    token1 = await client.get_access_token()
    token2 = await client.get_access_token()

    assert token1 == "mock_token_abc"
    assert token2 == "mock_token_abc"
    assert call_count == 1
    await client.close()


@pytest.mark.asyncio
async def test_create_order_authorization(mock_paypal):
    recorded_requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append(request)
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/checkout/orders":
            body = json.loads(request.content)
            assert body["intent"] == "AUTHORIZE"
            assert body["purchase_units"][0]["amount"]["value"] == "250.75"
            assert body["purchase_units"][0]["amount"]["currency_code"] == "USD"
            assert request.headers.get("paypal-request-id") == "req-order-1"
            return httpx.Response(
                201,
                json={
                    "id": "PAYPAL-ORD-999",
                    "status": "CREATED",
                    "links": [
                        {"rel": "approve", "href": "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORD-999"}
                    ],
                },
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    resp = await client.create_order_authorization(
        amount=Decimal("250.75"),
        currency="USD",
        order_id="omni-ord-001",
        request_id="req-order-1",
    )
    assert resp["id"] == "PAYPAL-ORD-999"
    assert resp["status"] == "CREATED"
    await client.close()


@pytest.mark.asyncio
async def test_authorize_order(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/checkout/orders/PAYPAL-ORD-999/authorize":
            assert request.headers.get("paypal-request-id") == "req-auth-1"
            return httpx.Response(
                201,
                json={
                    "id": "PAYPAL-ORD-999",
                    "status": "COMPLETED",
                    "purchase_units": [
                        {
                            "payments": {
                                "authorizations": [
                                    {
                                        "id": "AUTH-777",
                                        "status": "CREATED",
                                        "amount": {"currency_code": "USD", "value": "250.75"},
                                    }
                                ]
                            }
                        }
                    ],
                },
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    resp = await client.authorize_order("PAYPAL-ORD-999", "req-auth-1")
    auth = resp["purchase_units"][0]["payments"]["authorizations"][0]
    assert auth["id"] == "AUTH-777"
    assert auth["status"] == "CREATED"
    await client.close()


@pytest.mark.asyncio
async def test_capture_authorization_endpoint(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/payments/authorizations/AUTH-777/capture":
            assert request.headers.get("paypal-request-id") == "req-cap-1"
            return httpx.Response(
                201,
                json={
                    "id": "CAP-888",
                    "status": "COMPLETED",
                    "amount": {"currency_code": "USD", "value": "250.75"},
                },
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    resp = await client.capture_authorization("AUTH-777", "req-cap-1")
    assert resp["id"] == "CAP-888"
    assert resp["status"] == "COMPLETED"
    await client.close()


@pytest.mark.asyncio
async def test_void_authorization(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/payments/authorizations/AUTH-777/void":
            return httpx.Response(204)
        return httpx.Response(404)

    client = mock_paypal(handler)
    resp = await client.void_authorization("AUTH-777", "req-void-1")
    assert resp == {}
    await client.close()


@pytest.mark.asyncio
async def test_refund_capture(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/payments/captures/CAP-888/refund":
            body = json.loads(request.content)
            assert body["amount"]["value"] == "100.00"
            return httpx.Response(
                201,
                json={"id": "REFUND-111", "status": "COMPLETED"},
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    resp = await client.refund_capture(
        capture_id="CAP-888",
        request_id="req-ref-1",
        amount=Decimal("100.00"),
        currency="USD",
    )
    assert resp["id"] == "REFUND-111"
    assert resp["status"] == "COMPLETED"
    await client.close()


@pytest.mark.asyncio
async def test_verify_webhook_signature(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v1/notifications/verify-webhook-signature":
            body = json.loads(request.content)
            if body["transmission_sig"] == "valid_sig":
                return httpx.Response(200, json={"verification_status": "SUCCESS"})
            return httpx.Response(200, json={"verification_status": "FAILURE"})
        return httpx.Response(404)

    client = mock_paypal(handler)
    success = await client.verify_webhook_signature(
        transmission_id="trans_1",
        transmission_time="2026-10-20T00:00:00Z",
        cert_url="https://api.sandbox.paypal.com/cert",
        auth_algo="SHA256withRSA",
        transmission_sig="valid_sig",
        webhook_id="WH-123",
        webhook_event={"id": "EVT-1"},
    )
    assert success is True

    failed = await client.verify_webhook_signature(
        transmission_id="trans_1",
        transmission_time="2026-10-20T00:00:00Z",
        cert_url="https://api.sandbox.paypal.com/cert",
        auth_algo="SHA256withRSA",
        transmission_sig="bad_sig",
        webhook_id="WH-123",
        webhook_event={"id": "EVT-1"},
    )
    assert failed is False
    await client.close()


@pytest.mark.asyncio
async def test_error_handling_sanitization(mock_paypal):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok_123", "expires_in": 3600})
        if request.url.path == "/v2/checkout/orders":
            return httpx.Response(
                422,
                headers={"PayPal-Debug-Id": "dbg-12345"},
                json={
                    "name": "UNPROCESSABLE_ENTITY",
                    "message": "The requested action could not be performed",
                    "details": [{"issue": "CURRENCY_NOT_SUPPORTED"}],
                },
            )
        return httpx.Response(404)

    client = mock_paypal(handler)
    with pytest.raises(PayPalError) as exc_info:
        await client.create_order_authorization(
            amount=Decimal("10.00"),
            currency="USD",
            order_id="ord-err",
            request_id="req-err",
        )
    err = exc_info.value
    assert err.status_code == 422
    assert err.error_name == "UNPROCESSABLE_ENTITY"
    assert err.debug_id == "dbg-12345"
    assert len(err.details) == 1
    await client.close()
