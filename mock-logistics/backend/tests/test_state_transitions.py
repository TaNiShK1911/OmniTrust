def test_valid_transit_to_delivered(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-ST-1", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    del_res = client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    assert del_res.status_code == 200
    assert del_res.json()["carrier_status"] == "DELIVERED"

def test_valid_transit_to_damaged(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-ST-2", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    dmg_res = client.post(
        f"/api/v1/shipments/{tracking_id}/damage",
        json={"damage_reason": "crushed"}
    )
    assert dmg_res.status_code == 200
    assert dmg_res.json()["carrier_status"] == "DAMAGED"
    assert dmg_res.json()["goods_condition"] == "DAMAGED"

def test_invalid_delivered_to_damaged(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-ST-3", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    
    dmg_res = client.post(
        f"/api/v1/shipments/{tracking_id}/damage",
        json={"damage_reason": "crushed"}
    )
    assert dmg_res.status_code == 409
    assert dmg_res.json()["error"] == "INVALID_STATE_TRANSITION"

def test_invalid_damaged_to_delivered(client):
    res = client.post("/api/v1/create_shipment", json={"order_id": "ORD-ST-4", "item_count": 1})
    tracking_id = res.json()["tracking_id"]
    
    client.post(
        f"/api/v1/shipments/{tracking_id}/damage",
        json={"damage_reason": "crushed"}
    )
    
    del_res = client.post(f"/api/v1/shipments/{tracking_id}/deliver")
    assert del_res.status_code == 409
    assert del_res.json()["error"] == "INVALID_STATE_TRANSITION"
