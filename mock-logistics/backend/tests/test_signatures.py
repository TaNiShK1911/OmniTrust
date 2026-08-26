import hmac
import hashlib
from app.config import settings

def test_webhook_signature_verification(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-SIG-1", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    
    events = client.get(f"/api/v1/shipments/{tracking_id}/events").json()
    assert len(events) == 1
    event = events[0]
    
    # Manually compute signature
    expected_sig = hmac.new(
        settings.logistics_webhook_secret.encode("utf-8"),
        event["payload"].encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    assert event["signature"] == expected_sig
