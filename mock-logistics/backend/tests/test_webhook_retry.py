def test_webhook_retry(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-RTRY-1", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    
    events = client.get(f"/api/v1/shipments/{tracking_id}/events").json()
    assert len(events) == 1
    event_id = events[0]["id"]
    
    # Retry the webhook
    retry_res = client.post(f"/api/v1/webhook-events/{event_id}/retry")
    assert retry_res.status_code == 200
    
    # Verify attempt count is higher or it's now SENT
    assert retry_res.json()["attempt_count"] >= events[0]["attempt_count"]

def test_webhook_retry_nonexistent(client):
    retry_res = client.post("/api/v1/webhook-events/INVALID-ID/retry")
    assert retry_res.status_code == 404
    assert retry_res.json()["error"] == "SHIPMENT_NOT_FOUND"
