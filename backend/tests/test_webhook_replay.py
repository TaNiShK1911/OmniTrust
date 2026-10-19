"""
OmniTrust Backend — Unit Tests: Webhook Replay Protection
"""
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_webhook_replay_protection(mocker):
    # Mock DB client to avoid live DB connections
    mock_db = mocker.MagicMock()
    mocker.patch("app.api.webhooks.get_supabase_admin", return_value=mock_db)
    mocker.patch("app.db.queries.get_shipment_by_tracking", return_value=None)
    mocker.patch("app.api.webhooks.log_event")

    import hmac
    import hashlib
    import json
    from app.config import get_settings
    
    settings = get_settings()
    secret = settings.logistics_webhook_secret.encode("utf-8")
    
    now = datetime.now(timezone.utc)
    # Old timestamp (10 minutes ago) -> Should fail
    old_ts = (now - timedelta(minutes=10)).isoformat()
    
    payload = {
        "tracking_id": "test-123",
        "event": "IN_TRANSIT",
        "status": "IN_TRANSIT",
        "goods_condition": "intact",
        "timestamp": old_ts,
        "event_id": "evt_test123"
    }
    
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()
    
    resp = client.post("/api/webhooks/logistics", content=body, headers={"x-logistics-signature": signature})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "REPLAY_ATTEMPT"
    
    # Valid timestamp (1 minute ago) -> Should pass replay check (might fail later on shipment validation, but that's fine, it means it passed step 2.5)
    valid_ts = (now - timedelta(minutes=1)).isoformat()
    payload["timestamp"] = valid_ts
    body2 = json.dumps(payload).encode("utf-8")
    signature2 = hmac.new(secret, body2, hashlib.sha256).hexdigest()
    
    resp2 = client.post("/api/webhooks/logistics", content=body2, headers={"x-logistics-signature": signature2})
    # Will likely return 404 since tracking 'test-123' doesn't exist, but NOT 400
    assert resp2.status_code == 404
    assert resp2.json()["error"]["code"] == "SHIPMENT_NOT_FOUND"


def test_webhook_valid_delivery_dispatches_celery_task(mocker):
    """Verify valid signed DELIVERED webhook enqueues Celery settlement task."""
    import hashlib
    import hmac
    import json
    from app.config import get_settings

    mock_db = mocker.MagicMock()
    mocker.patch("app.api.webhooks.get_supabase_admin", return_value=mock_db)
    mocker.patch("app.db.queries.check_audit_event_exists", return_value=False)
    mocker.patch(
        "app.db.queries.get_shipment_by_tracking",
        return_value={
            "id": "ship-1",
            "user_id": "user-abc",
            "orders": {"id": "order-xyz"},
        },
    )
    mocker.patch("app.db.queries.update_shipment")
    mocker.patch("app.db.queries.update_order")
    mocker.patch("app.api.webhooks.log_event")

    mock_celery_task = mocker.patch("app.worker.tasks.process_settlement_capture_task.delay")
    mock_celery_task.return_value = mocker.MagicMock(id="task-job-123")

    settings = get_settings()
    secret = settings.logistics_webhook_secret.encode("utf-8")
    now_ts = datetime.now(timezone.utc).isoformat()

    payload = {
        "tracking_id": "TRK-VALID-999",
        "event": "DELIVERED",
        "status": "DELIVERED",
        "goods_condition": "intact",
        "timestamp": now_ts,
        "event_id": "evt_delivered_001",
    }
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()

    resp = client.post(
        "/api/webhooks/logistics",
        content=body,
        headers={"x-logistics-signature": signature},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["delivered"] is True
    # Celery settlement task must be enqueued asynchronously
    mock_celery_task.assert_called_once_with(order_id="order-xyz", user_id="user-abc")


def test_webhook_invalid_signature_blocks_all_actions(mocker):
    """Verify invalid HMAC signature is rejected with 401 and zero financial action."""
    import json

    mock_celery_task = mocker.patch("app.worker.tasks.process_settlement_capture_task.delay")
    mock_update_order = mocker.patch("app.db.queries.update_order")

    now_ts = datetime.now(timezone.utc).isoformat()
    payload = {
        "tracking_id": "TRK-FAKE",
        "event": "DELIVERED",
        "status": "DELIVERED",
        "goods_condition": "intact",
        "timestamp": now_ts,
        "event_id": "evt_bad_sig",
    }
    body = json.dumps(payload).encode("utf-8")

    resp = client.post(
        "/api/webhooks/logistics",
        content=body,
        headers={"x-logistics-signature": "bogus-signature-hex"},
    )
    assert resp.status_code == 401
    assert resp.json()["financial_action"] == "none"
    mock_celery_task.assert_not_called()
    mock_update_order.assert_not_called()


def test_webhook_damaged_creates_dispute_and_never_settles(mocker):
    """Verify DAMAGED webhook creates dispute and NEVER dispatches settlement capture."""
    import hashlib
    import hmac
    import json
    from app.config import get_settings

    mock_db = mocker.MagicMock()
    mocker.patch("app.api.webhooks.get_supabase_admin", return_value=mock_db)
    mocker.patch("app.db.queries.check_audit_event_exists", return_value=False)
    mocker.patch(
        "app.db.queries.get_shipment_by_tracking",
        return_value={
            "id": "ship-2",
            "user_id": "user-buyer",
            "orders": {"id": "order-damaged-goods"},
        },
    )
    mocker.patch("app.db.queries.update_shipment")
    mocker.patch("app.db.queries.update_order")
    mocker.patch("app.api.webhooks.log_event")

    mock_dispute = mocker.patch("app.services.dispute_service.create_dispute")
    mock_dispute.return_value = {"id": "disp-damaged-999"}
    mock_celery_task = mocker.patch("app.worker.tasks.process_settlement_capture_task.delay")

    settings = get_settings()
    secret = settings.logistics_webhook_secret.encode("utf-8")
    now_ts = datetime.now(timezone.utc).isoformat()

    payload = {
        "tracking_id": "TRK-DAMAGED-123",
        "event": "DAMAGED",
        "status": "DAMAGED",
        "goods_condition": "damaged",
        "timestamp": now_ts,
        "event_id": "evt_damaged_001",
    }
    body = json.dumps(payload).encode("utf-8")
    signature = hmac.new(secret, body, hashlib.sha256).hexdigest()

    resp = client.post(
        "/api/webhooks/logistics",
        content=body,
        headers={"x-logistics-signature": signature},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["delivered"] is False
    assert data["dispute_id"] == "disp-damaged-999"

    # Crucial: settlement capture must NOT be dispatched for damaged goods
    mock_celery_task.assert_not_called()
    mock_dispute.assert_called_once_with(
        mock_db, order_id="order-damaged-goods", user_id="user-buyer", reason="DAMAGED_GOODS"
    )
