def test_prevent_duplicate_active_shipments(client):
    # First shipment succeeds
    res1 = client.post("/api/v1/create_shipment", json={"order_id": "ORD-DUP", "item_count": 1})
    assert res1.status_code == 201

    # Second shipment with same order_id fails (409 Conflict)
    res2 = client.post("/api/v1/create_shipment", json={"order_id": "ORD-DUP", "item_count": 1})
    assert res2.status_code == 409
    assert res2.json()["error"] == "SHIPMENT_ALREADY_EXISTS"

def test_allow_new_shipment_if_previous_is_terminal(client):
    res1 = client.post("/api/v1/create_shipment", json={"order_id": "ORD-TERM", "item_count": 1})
    tracking_id = res1.json()["tracking_id"]
    
    # Mark delivered
    client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    
    # Second shipment with same order_id succeeds now that first is DELIVERED
    res2 = client.post("/api/v1/create_shipment", json={"order_id": "ORD-TERM", "item_count": 1})
    assert res2.status_code == 201
