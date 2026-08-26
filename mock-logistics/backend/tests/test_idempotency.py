def test_idempotent_delivery(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-IDEM-1", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    # First delivery
    del1 = client.post(
        f"/api/v1/shipments/{tracking_id}/deliver",
        headers={"Idempotency-Key": "deliver-idem-1"}
    )
    assert del1.status_code == 200
    
    # Second delivery with same idempotency key should return 200 and not create a new webhook
    del2 = client.post(
        f"/api/v1/shipments/{tracking_id}/deliver",
        headers={"Idempotency-Key": "deliver-idem-1"}
    )
    assert del2.status_code == 200
    
    # Verify only 1 webhook event was created
    events_res = client.get(f"/api/v1/shipments/{tracking_id}/events")
    assert len(events_res.json()) == 1
    assert events_res.json()[0]["event_type"] == "DELIVERED"

def test_idempotent_damage(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-IDEM-2", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    dmg1 = client.post(
        f"/api/v1/shipments/{tracking_id}/damage",
        json={"damage_reason": "crushed"},
        headers={"Idempotency-Key": "damage-idem-1"}
    )
    assert dmg1.status_code == 200
    
    dmg2 = client.post(
        f"/api/v1/shipments/{tracking_id}/damage",
        json={"damage_reason": "crushed"},
        headers={"Idempotency-Key": "damage-idem-1"}
    )
    assert dmg2.status_code == 200
    
    events_res = client.get(f"/api/v1/shipments/{tracking_id}/events")
    assert len(events_res.json()) == 1
    assert events_res.json()[0]["event_type"] == "DAMAGED"
