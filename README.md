# OmniTrust — Trusted Commerce for Autonomous Agents

OmniTrust enables AI buyer and seller agents to negotiate B2B deals while deterministic policy gates—not an LLM—control all financial operations. PayPal Sandbox Orders v2 initiates buyer approval and Payments v2 authorization holds funds until verified logistics evidence and dispute checks satisfy the release policy.

## Architecture

- **FastAPI Backend (`/backend`)**: Core marketplace API, PayPal Sandbox integration, deterministic policy gates, and webhook verification.
- **TanStack Start Frontend (`/frontend`)**: Operator dashboard, AG Grid Agentic Audit Command Center, PayPal Smart Buttons checkout, Bryntum Timeline, and Developer Hub.
- **Mock Logistics Service (`/mock-logistics`)**: Standalone 3PL simulation service with HMAC-SHA256 signed delivery events.
- **Render Blueprint (`render.yaml`)**: Cloud deployment configuration for API, logistics, and frontend services.
- **OpenAPI 3.0 & APIMatic SDKs (`/api`)**: Strongly typed Python and TypeScript SDKs for external agent integration.

## Features

- **Autonomous Agent Negotiation**: Buyer and seller agents negotiate deal terms within bounded price floors and turn limits.
- **PayPal Sandbox Authorization Escrow**: Creates orders with `intent: "AUTHORIZE"`; funds are conditionally held by PayPal and released only after cryptographic delivery proof.
- **AG Grid Command Center**: Real-time operator telemetry grid with consensus scores, logistics proof hashes, and canonical payment states.
- **Bryntum Timeline Ready**: Visual lifecycle milestone tracks from price agreement to carrier delivery and settlement.
- **Cryptographic Verification**: PayPal webhooks verified via official `/v1/notifications/verify-webhook-signature` API; logistics events verified via HMAC-SHA256.
- **Deterministic Guardrails**: Financial mutations (capture, void, refund) are executed strictly by deterministic policy checks; LLMs recommend but never move money.

## Setup Instructions

### Prerequisites
- Python 3.12+
- Node.js 18+ (npm 10+)
- Supabase Project & Credentials
- Groq API Key (for LLM Agents)
- PayPal Sandbox Account (`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`)

### Backend Configuration
1. Navigate to `backend/`.
2. Configure `.env` with:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`
   - `PAYPAL_WEBHOOK_ID`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
   - `GROQ_API_KEY`
3. Install dependencies: `pip install -r requirements.txt`.
4. Run server: `uvicorn app.main:app --reload --port 8000`.

### Mock Logistics Configuration
1. Navigate to `mock-logistics/backend`.
2. Install dependencies: `pip install -r requirements.txt`.
3. Run service: `uvicorn main:app --port 5001 --reload`.

### Frontend Configuration
1. Navigate to `frontend/`.
2. Install dependencies: `npm install --legacy-peer-deps`.
3. Configure `VITE_PAYPAL_CLIENT_ID` in `.env`.
4. Start dev server: `npm run dev`.

## Running Tests

Run backend tests:
```powershell
cd backend
pytest
```
Run mock logistics tests:
```powershell
cd mock-logistics/backend
python -m pytest
```
Build frontend:
```powershell
cd frontend
npm run build
```
