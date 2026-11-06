# QA report

## Overall readiness: PARTIAL / not demonstration-ready

The basic live stack, real Supabase auth/persistence, backend health, PayPal Sandbox OAuth, mock 3PL health, and browser authenticated catalog were verified. The critical complete journey is not verified and must not be presented as working: Groq is unavailable, no PayPal buyer approval/capture occurred, Celery is not running, and the browser negotiation action stalls.

## Results

| Area | Status | Evidence |
|---|---|---|
| Supabase connectivity/catalog | PASS | live dependency health: reachable, 12 products. |
| Supabase auth/authorization | PASS | real QA accounts; invalid password rejected; 401 unauthenticated; cross-user read 403 after fix. |
| PayPal Sandbox credential/OAuth | PASS | real OAuth access token acquired, redacted. |
| Groq | BLOCKED | no configured key. |
| Mock logistics service | PASS | local `/health` response. |
| Backend unit regression | PASS | `tests/test_security_auth.py`: 3 passed. |
| Existing full Python suites | BLOCKED | TestClient deadlock under Python 3.14. |
| Frontend build | PASS | Vite production build succeeded; deprecation/chunk warnings remain. |
| Browser auth/catalog | PASS | Playwright under Node 22. |
| Browser negotiation/order/payment journey | FAIL/PARTIAL | catalog action remained `Opening…`; no order/payment continuation verified. |
| PayPal financial lifecycle | BLOCKED | no Sandbox buyer account or webhook ID; no financial mutation attempted. |
| Conditional settlement/dispute | NOT TESTED | prerequisite authorized transaction unavailable. |
| Worker | BLOCKED | Redis unavailable. |

## Bugs fixed

- Strict backend authentication and JWT validation.
- Backend resource ownership enforcement and regression tests.
- Strict frontend server-function authentication.
- Added required public Supabase runtime variables to Render frontend configuration.

## Exact checks run

```bash
cd backend && .venv/bin/pytest -q tests/test_security_auth.py
cd frontend && node node_modules/vite/bin/vite.js build
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/health/dependencies
curl http://127.0.0.1:5001/health
```

For a complete demo, resolve the BLOCKED items and fix/retest the browser negotiation action before claiming end-to-end readiness.

