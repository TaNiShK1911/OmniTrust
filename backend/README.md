# OmniTrust Backend — PayPal Sandbox & Policy Guardrails

FastAPI Python backend powering autonomous agent commerce, PayPal Sandbox authorization hold workflows, deterministic release gates, and cryptographic webhook verification.

## Quick Start

### 1. Set up Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

### 2. Configure environment (`backend/.env`)

```ini
APP_ENV=development
API_PORT=8000
FRONTEND_ORIGIN=http://localhost:3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Groq LLM
GROQ_API_KEY=gsk_your_groq_key

# PayPal Sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=your_sandbox_webhook_id

# Logistics
LOGISTICS_BASE_URL=http://localhost:5001
LOGISTICS_WEBHOOK_SECRET=omnitrust_logistics_secret_2026
```

### 3. Start Mock Logistics (Port 5001)

```powershell
cd mock-logistics/backend
python main.py
```

### 4. Start FastAPI Backend (Port 8000)

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

---

## API Endpoints

- **Interactive Documentation**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`
- **Dependencies Status**: `http://localhost:8000/api/health/dependencies`
- **PayPal Order (Authorize Intent)**: `POST /api/v1/orders/{order_id}/paypal-order`
- **PayPal Authorize**: `POST /api/v1/orders/{order_id}/authorize`
- **PayPal Capture (Gated)**: `POST /api/v1/orders/{order_id}/capture`
- **PayPal Void**: `POST /api/v1/orders/{order_id}/void`
- **PayPal Webhooks**: `POST /api/webhooks/paypal`
- **AG Grid Telemetry**: `GET /api/audit/command-center`

---

## Security & Verification Invariants

- **Separation of Concerns**: LLMs recommend prices; deterministic Python gates decide; server payment services execute money calls.
- **Client Credential Protection**: PayPal client secrets and Bearer tokens are strictly server-side and never returned to the frontend.
- **Idempotent Mutations**: Each payment operation uses a unique persisted idempotency key and `PayPal-Request-Id` to prevent duplicate charges or releases.
- **Dual Webhook Verification**: PayPal webhooks are verified via official PayPal RSA verification APIs; logistics webhooks are verified via HMAC-SHA256 signatures.
