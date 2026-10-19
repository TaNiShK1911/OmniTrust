/**
 * OmniTrust — APIMatic SDK Code Examples for External Autonomous Agents
 *
 * Demonstrates how external AI buyer/seller agents integrate against OmniTrust
 * to negotiate within policy caps, authorize payments via PayPal, and verify delivery.
 */

export const PYTHON_SDK_EXAMPLE = `"""
OmniTrust Autonomous Agent Integration (Python)
Generated via APIMatic OpenAPI 3.0 specification.
"""
import os
import httpx

API_BASE = os.getenv("OMNITRUST_API_BASE", "http://localhost:8000")
API_TOKEN = os.getenv("OMNITRUST_BEARER_TOKEN", "your_agent_jwt_token")

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# 1. Start Autonomous Negotiation
with httpx.Client(base_url=API_BASE, headers=headers) as client:
    session_res = client.post("/api/v1/negotiations", json={
        "product_id": "00000000-0000-0000-0000-000000000001",
        "quantity": 10,
        "target_discount_pct": 5.0,
    })
    session = session_res.json()
    session_id = session["data"]["id"]
    print(f"Negotiation session initiated: {session_id}")

    # 2. Advance negotiation turn (evaluated by deterministic gatekeeper)
    turn_res = client.post(f"/api/v1/negotiations/{session_id}/next-turn")
    print(f"Turn outcome: {turn_res.json()}")

    # 3. Create Order from agreed negotiation
    order_res = client.post(f"/api/v1/orders/from-negotiation/{session_id}")
    order_id = order_res.json()["data"]["id"]
    print(f"Order created: {order_id}")

    # 4. Initiate PayPal Orders v2 with intent=AUTHORIZE
    pp_res = client.post(f"/api/v1/orders/{order_id}/paypal-order")
    paypal_order = pp_res.json()["data"]
    print(f"PayPal Order: {paypal_order['paypal_order_id']}")
    print(f"Buyer Approval URL: {paypal_order['approval_url']}")

    # 5. Query Canonical Payment State
    payment_status = client.get(f"/api/v1/orders/{order_id}/payment").json()
    print(f"State: {payment_status['data']['state']}")
`;

export const TYPESCRIPT_SDK_EXAMPLE = `/**
 * OmniTrust Autonomous Agent Integration (TypeScript)
 * Generated via APIMatic SDK Generator.
 */
import { OmniTrustClient } from "@omnitrust/sdk";

const client = new OmniTrustClient({
  baseUrl: process.env.OMNITRUST_API_BASE ?? "http://localhost:8000",
  accessToken: process.env.OMNITRUST_BEARER_TOKEN ?? "your_agent_jwt_token",
});

async function runAutonomousCommerce() {
  // 1. Initiate negotiation
  const session = await client.negotiations.createSession({
    productId: "00000000-0000-0000-0000-000000000001",
    quantity: 5,
    targetDiscountPct: 7.5,
  });
  console.log("Negotiation active:", session.id);

  // 2. Autonomous agreement within spending policy
  const approved = await client.negotiations.approveSession(session.id);
  console.log("Consensus agreed unit price:", approved.agreedUnitPrice);

  // 3. Create PayPal authorization order
  const order = await client.orders.createFromNegotiation(session.id);
  const paypalOrder = await client.payments.createPayPalOrder(order.id);
  console.log("PayPal Order ID:", paypalOrder.paypalOrderId);
  console.log("Approve URL:", paypalOrder.approvalUrl);

  // 4. Poll canonical payment status
  const status = await client.payments.getPaymentStatus(order.id);
  console.log("Canonical Payment State:", status.state); // FUNDS_AUTHORIZED
}

runAutonomousCommerce().catch(console.error);
`;

export const IDEMPOTENCY_EXAMPLE = `// Safe Idempotent Mutating Operations
// Pass a unique Idempotency-Key header on every financial mutation.
const headers = {
  "Authorization": \`Bearer \${token}\`,
  "Content-Type": "application/json",
  "Idempotency-Key": \`idem_\${orderId}_\${Date.now()}\`,
};

// If a network timeout occurs, retrying with the same Idempotency-Key
// will return the original authorization record without creating duplicate holds.
const res = await fetch(\`http://localhost:8000/api/v1/orders/\${orderId}/paypal-order\`, {
  method: "POST",
  headers,
});
`;
