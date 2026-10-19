"""
Unit tests for PayPal Webhook Endpoint and Event Deduplication
"""
import json
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.supabase import get_supabase_admin
from app.schemas.payments import PaymentState


class FakeDB:
    def __init__(self):
        self.transactions = []
        self.events = {}
        self.orders = {}

    def table(self, name: str):
        return FakeTable(self, name)


class FakeTable:
    def __init__(self, db: FakeDB, name: str):
        self.db = db
        self.name = name
        self._filters = {}
        self._order_by = None
        self._limit_count = None
        self._pending_insert = None
        self._pending_update = None

    def insert(self, data):
        self._pending_insert = data
        return self

    def update(self, data):
        self._pending_update = data
        return self

    def select(self, *args):
        return self

    def eq(self, field: str, value: any):
        self._filters[field] = value
        return self

    def order(self, field: str, desc: bool = False):
        self._order_by = (field, desc)
        return self

    def limit(self, count: int):
        self._limit_count = count
        return self

    def execute(self):
        class Result:
            def __init__(self, data):
                self.data = data

        if self.name == "paypal_webhook_events":
            if self._pending_insert:
                item = {**self._pending_insert}
                self.db.events[item["event_id"]] = item
                return Result([item])
            if "event_id" in self._filters:
                eid = self._filters["event_id"]
                return Result([self.db.events[eid]] if eid in self.db.events else [])
            return Result([])

        elif self.name == "payment_transactions":
            if self._pending_insert:
                item = {"id": "tx_mock_1", **self._pending_insert}
                self.db.transactions.append(item)
                return Result([item])
            if self._pending_update:
                target_id = self._filters.get("id")
                for tx in self.db.transactions:
                    if tx.get("id") == target_id:
                        tx.update(self._pending_update)
                        return Result([tx])
                return Result([self._pending_update])
            # Querying
            matched = self.db.transactions
            for k, v in self._filters.items():
                matched = [t for t in matched if t.get(k) == v]
            return Result(matched)

        elif self.name == "orders":
            if self._pending_update:
                oid = self._filters.get("id")
                if oid in self.db.orders:
                    self.db.orders[oid].update(self._pending_update)
                return Result([self.db.orders.get(oid, {})])
            oid = self._filters.get("id")
            return Result([self.db.orders.get(oid)] if oid in self.db.orders else [])

        elif self.name == "audit_events":
            return Result([{"id": "aud_1"}])

        return Result([])


@pytest.fixture
def client():
    fake_db = FakeDB()
    # Pre-populate sample order and transaction
    order_id = "00000000-0000-0000-0000-000000000001"
    fake_db.orders[order_id] = {
        "id": order_id,
        "user_id": "usr_123",
        "status": "escrow_pending",
        "escrow_status": "pending",
        "total_amount": 100.0,
        "currency": "USD",
    }
    fake_db.transactions.append({
        "id": "tx_001",
        "order_id": order_id,
        "paypal_order_id": "PAYPAL-ORD-TEST-1",
        "authorization_id": "AUTH-TEST-1",
        "capture_id": "CAP-TEST-1",
        "state": PaymentState.PENDING_APPROVAL.value,
        "amount": 100.0,
        "currency": "USD",
    })

    app.dependency_overrides[get_supabase_admin] = lambda: fake_db
    with TestClient(app) as tc:
        yield tc, fake_db
    app.dependency_overrides.clear()


def test_missing_transmission_headers_rejected(client):
    tc, _ = client
    resp = tc.post("/api/webhooks/paypal", json={"id": "EVT-1"})
    assert resp.status_code == 400
    assert "Missing required PayPal webhook transmission headers" in resp.json()["error"]["message"]


def test_duplicate_event_suppressed(client):
    tc, fake_db = client
    headers = {
        "paypal-transmission-id": "trans-1",
        "paypal-transmission-time": "2026-10-20T00:00:00Z",
        "paypal-transmission-sig": "test_sig",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-auth-algo": "SHA256withRSA",
    }
    payload = {
        "id": "EVT-DUPE-123",
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {"id": "PAYPAL-ORD-TEST-1"},
    }

    # Mark as already processed
    fake_db.events["EVT-DUPE-123"] = {"event_id": "EVT-DUPE-123", "status": "processed"}

    resp = tc.post("/api/webhooks/paypal", headers=headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "duplicate_suppressed"


@pytest.mark.asyncio
async def test_order_approved_event_transition(client):
    tc, fake_db = client
    headers = {
        "paypal-transmission-id": "trans-2",
        "paypal-transmission-time": "2026-10-20T00:00:00Z",
        "paypal-transmission-sig": "test_sig",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-auth-algo": "SHA256withRSA",
    }
    payload = {
        "id": "EVT-APPROVED-1",
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {"id": "PAYPAL-ORD-TEST-1"},
    }

    resp = tc.post("/api/webhooks/paypal", headers=headers, json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "processed"

    # Verify transaction transitioned to PENDING_AUTHORIZATION
    tx = fake_db.transactions[0]
    assert tx["state"] == PaymentState.PENDING_AUTHORIZATION.value


@pytest.mark.asyncio
async def test_authorization_voided_event_transition(client):
    tc, fake_db = client
    fake_db.transactions[0]["state"] = PaymentState.FUNDS_AUTHORIZED.value
    headers = {
        "paypal-transmission-id": "trans-3",
        "paypal-transmission-time": "2026-10-20T00:00:00Z",
        "paypal-transmission-sig": "test_sig",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-auth-algo": "SHA256withRSA",
    }
    payload = {
        "id": "EVT-VOID-1",
        "event_type": "PAYMENT.AUTHORIZATION.VOIDED",
        "resource": {"id": "AUTH-TEST-1"},
    }

    resp = tc.post("/api/webhooks/paypal", headers=headers, json=payload)
    assert resp.status_code == 200
    tx = fake_db.transactions[0]
    assert tx["state"] == PaymentState.VOIDED.value
