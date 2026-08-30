"""
OmniTrust Backend — External Buyer Agent

A standalone script demonstrating how an external AI agent authenticates,
browses the catalog, and negotiates an order entirely through public APIs.
"""
import time
import httpx
from app.config import get_settings

def run_external_agent_flow():
    settings = get_settings()
    base_url = f"http://localhost:{settings.api_port}"
    
    # 1. Register and get a short-lived token
    print("1. Registering external agent...")
    with httpx.Client(base_url=base_url) as client:
        reg_resp = client.post("/api/v1/agents/register", json={
            "agent_name": "DemoExternalAgent",
            "spending_cap": 100000.0
        })
        reg_resp.raise_for_status()
        token = reg_resp.json()["data"]["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Browse catalog
        print("2. Fetching catalog feed...")
        cat_resp = client.get("/api/v1/catalog/agent-feed", headers=headers)
        cat_resp.raise_for_status()
        feed = cat_resp.json()["data"]
        
        # Find first available product
        product = next(p for p in feed if p["offers"]["availability"] == "https://schema.org/InStock")
        print(f"   Selected product: {product['name']} (SKU: {product['sku']}) at ₹{product['offers']['price']}")
        
        # Since the catalog doesn't expose the internal ID, we need to fetch it via the standard product list
        # In a real scenario, the catalog feed would expose the ID or we would search by SKU.
        # For simplicity, we just fetch the products list to get the ID.
        products_resp = client.get(f"/api/v1/products?search={product['sku']}", headers=headers)
        real_product = products_resp.json()["data"][0]
        product_id = real_product["id"]

        # 3. Open negotiation
        print("3. Starting negotiation...")
        neg_resp = client.post("/api/v1/negotiations", headers=headers, json={
            "product_id": product_id,
            "quantity": 10,
            "buyer_message": "Hello, I am an external AI agent. Can I get a 10% discount for bulk purchase?"
        })
        neg_resp.raise_for_status()
        session_id = neg_resp.json()["data"]["id"]
        
        # 4. Run negotiation turns until agreed or expired
        print(f"4. Negotiating session {session_id}...")
        status = "active"
        while status == "active":
            turn_resp = client.post(f"/api/v1/negotiations/{session_id}/next-turn", headers=headers)
            turn_resp.raise_for_status()
            neg_data = turn_resp.json()["data"]["negotiation"]
            status = neg_data["status"]
            turns = neg_data["turns"]
            last_turn = turns[-1]
            print(f"   Turn {neg_data['turn_count']}: {last_turn['actor']} proposed ₹{last_turn.get('proposed_unit_price')} - Decision: {last_turn.get('decision', last_turn.get('action'))}")
            time.sleep(1) # brief pause for readability
            
        print(f"   Negotiation finished with status: {status}")
        
        # 5. Approve if agreed
        if status == "agreed":
            print("5. Approving consensus and creating order...")
            appr_resp = client.post(f"/api/v1/negotiations/{session_id}/approve", headers=headers)
            appr_resp.raise_for_status()
            order_id = appr_resp.json()["data"]["order_id"]
            print(f"   Success! Order created: {order_id}")
            return True
            
        return False

if __name__ == "__main__":
    run_external_agent_flow()
