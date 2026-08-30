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
