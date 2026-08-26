def test_list_webhook_events(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-WH-1", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    
    res = client.get("/api/v1/webhook-events")
    assert res.status_code == 200
    events = res.json()
    assert len(events) >= 1
    assert any(e["tracking_id"] == tracking_id for e in events)

def test_webhook_event_fields(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-WH-2", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(f"/api/v1/shipments/{tracking_id}/damage", json={"damage_reason": "crushed"})
    
    events = client.get(f"/api/v1/shipments/{tracking_id}/events").json()
    assert len(events) == 1
    event = events[0]
    
    assert event["event_type"] == "DAMAGED"
    assert "payload" in event
    assert "signature" in event
    assert "delivery_status" in event
    assert "attempt_count" in event
    # If OmniTrust is running, this will be SENT. If not, FAILED. Both are valid schemas.
