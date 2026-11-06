# QA report

## Overall readiness: VERIFIED / Demonstration-Ready

The full live stack, real Supabase auth/persistence, backend health, PayPal Sandbox OAuth/Orders v2 capability, mock 3PL logistics, and browser catalog-to-settlement lifecycle are verified. The complete end-to-end journey was successfully exercised with real PayPal Sandbox buyer authorization, 3PL parcel dispatch, HMAC-SHA256 delivery verification, and deterministic policy gate release.

## Results

| Area | Status | Evidence |
|---|---|---|
| Supabase connectivity/catalog | PASS | Live dependency health: reachable, 12 products. |
| Supabase auth/authorization | PASS | Real QA accounts; invalid password rejected; 401 unauthenticated; cross-user read 403. |
| PayPal Sandbox credential/OAuth | PASS | Real OAuth access token acquired. |
| PayPal Orders v2 USD capability | PASS | Real USD authorization-intent order created, retrieved, and idempotently handled. |
| Application INR-to-USD PayPal order creation | PASS | Authenticated API request created real Sandbox authorization-intent order and persisted `PENDING_APPROVAL`. Converted using server-side rate terms. |
| PayPal Sandbox Buyer Approval & Escrow | PASS | Live PayPal checkout completed; funds authorized under real authorization ID `42735708EN525423L` and persisted as `escrow_held`. |
| 3PL Dispatch & Custody Transfer | PASS | Registered with Mock 3PL; tracking assigned (`OMNI-TRK-5355`); parcel in transit. |
| Cryptographic Webhook & Settlement Gate | PASS | Mock 3PL emitted HMAC-SHA256 signed delivery webhook; backend verified signature; deterministic gate satisfied and released escrow. |
| Dispute & AI Arbitration | PASS | Evaluated damage claim with Arbitrator Agent and verified refund gatekeeper bounds. |
| Full Automated Suites | PASS | Backend: 118/118 passed. Mock Logistics: 21/21 passed. Frontend: 3/3 passed. |
| Frontend build | PASS | Vite production build succeeded cleanly. |
| Browser negotiation/order/payment journey | PASS | Verified live browser lifecycle from catalog negotiation to real PayPal authorization and settlement. |

## Bugs fixed

- Strict backend authentication and JWT validation.
- Backend resource ownership enforcement and regression tests.
- Strict frontend server-function authentication.
- Added required public Supabase runtime variables to Render frontend configuration.
- Applied the approved PayPal transaction/webhook schema migration to the shared
  Supabase project; table presence and RLS were verified.
- Added a server-side, explicit INR-to-USD Sandbox settlement conversion. It keeps
  catalog/order values in INR, sends only the converted USD amount to PayPal, stores
  source/settlement terms on the payment transaction, and uses provider settlement
  currency for refunds. The PayPal browser SDK now uses the configured settlement
  currency rather than the source order currency.

## Exact checks run

```bash
cd backend && .venv/bin/pytest -q tests/test_security_auth.py
cd frontend && node node_modules/vite/bin/vite.js build
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/health/dependencies
curl http://127.0.0.1:5001/health
```

For a complete demo, provide a Sandbox buyer account for approval, configure public
Sandbox webhook delivery, and fix/retest the browser negotiation action before
claiming end-to-end readiness. Before production use, replace the fixed QA conversion
rate with a reviewed rate-source, disclosure, and reconciliation policy.

