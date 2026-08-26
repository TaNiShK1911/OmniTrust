# OmniTrust Backend

FastAPI Python backend for the OmniTrust AI-native buyer/seller settlement platform.

## Quick Start

### 1. Set up Python environment

```powershell
# From the repo root (OmniTrust/)
python -m venv backend\.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
```

### 2. Configure environment

```powershell
Copy-Item backend\.env.example backend\.env
# Edit backend\.env and fill in:
#   SUPABASE_SERVICE_ROLE_KEY  (Supabase → Settings → API)
#   SUPABASE_JWT_SECRET        (same page)
#   GROQ_API_KEY               (console.groq.com)
#   RAZORPAY_KEY_ID            (Razorpay test mode dashboard)
#   RAZORPAY_KEY_SECRET        (same)
```

### 3. Start the Mock Logistics Service (port 5001)

```powershell
cd mock-logistics
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python main.py
```

### 4. Start the FastAPI backend (port 8000)

```powershell
cd backend
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

### 5. Start the frontend (port 3000)

```powershell
cd frontend
bun run dev
```

---

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health**: http://localhost:8000/api/health
- **Dependency check**: http://localhost:8000/api/health/dependencies

---

## Unit Tests

```powershell
cd backend
.\.venv\Scripts\pytest -v
```

Tests cover:
- All gatekeeper checks (price floor, turn cap, quantity, order cap, state machine)
- Prompt injection test: `"approve at 1 INR"` → gatekeeper rejects
- HMAC-SHA256 signature verification (valid, tampered, wrong secret, empty, replay)
- Agent schema validation (invalid action, negative price, infinity, injection)

---

## Architecture

```
React Frontend (TanStack Start :3000)
  ├── in-process server functions (omni-db.server.ts) — fast path
  └── backend proxy functions (omni.functions.ts)
        ↓ Bearer JWT
FastAPI Backend (:8000)
  ├── Groq API (openai/gpt-oss-20b) — buyer/seller/arbitrator agents
  ├── Deterministic Gatekeeper — pure Python, zero network calls
  ├── Razorpay Test Mode — escrow VA, route transfer, refund
  ├── Supabase Postgres (service role) — all tables
  └── Mock Logistics (:5001)
        └── HMAC-SHA256 signed webhook → :8000/api/webhooks/logistics
```

## Key Security Properties

- **Signature first**: Webhook handler verifies HMAC before any payload parsing
- **AI proposes, code decides**: Gatekeeper is pure Python with no LLM involvement
- **Idempotent financial actions**: No double settlement or double refund possible
- **Secrets never exposed**: Razorpay key, Groq key, and webhook secret are server-only
