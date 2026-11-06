# Testing setup

Use supported runtimes first: Python 3.12 and Node 22.12+.

```bash
# terminal 1
cd mock-logistics/backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 5001

# terminal 2
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 3
cd frontend
npm ci --legacy-peer-deps
npm run build
set -a; . ./.env; set +a
node .output/server/index.mjs
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend runtime environment, plus the backend variables listed in `backend/README.md`. To demonstrate the full financial path, additionally configure `GROQ_API_KEY`, `PAYPAL_WEBHOOK_ID`, a PayPal Sandbox buyer account, and Redis.

The local QA setup uses an explicit server-side INR-to-USD settlement configuration:
set `PAYPAL_SETTLEMENT_CURRENCY=USD`, `PAYPAL_INR_TO_USD_RATE` to the reviewed QA
rate, and `VITE_PAYPAL_SETTLEMENT_CURRENCY=USD`. Do not change a payment amount in
the browser. The backend converts and records payment terms; the browser only receives
the PayPal order ID. Replace the fixed QA rate with a reviewed FX policy before any
production deployment.

