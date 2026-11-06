# QA architecture

## Verified topology

`React/TanStack Start browser -> TanStack server functions -> FastAPI -> Supabase/PayPal`.

The FastAPI backend owns the current PayPal Orders v2/Payments v2 client, Groq agents, deterministic gatekeeper, Supabase service-role persistence, HMAC webhook ingestion, and optional Celery tasks. `mock-logistics/backend` is an intentional SQLite-backed simulated 3PL, not a real carrier. The frontend calls FastAPI through `src/lib/omni.functions.ts`; older `omni-db.server.ts`/`engine.server.ts` code is a separate, currently unused orchestration path and must not be used as evidence of Groq or PayPal functionality.

## Evidence baseline

| Boundary | Status | Evidence |
|---|---|---|
| Mock 3PL HTTP | PASS | `GET /health` returned `status: ok`. |
| FastAPI HTTP | PASS | `GET /api/health` returned 200. |
| Supabase | PASS | dependency health returned reachable with 12 products. |
| PayPal Sandbox OAuth | PASS | real OAuth token acquired; value redacted. |
| Groq | BLOCKED | `GROQ_API_KEY` absent; health reports deterministic fallback. |
| Frontend build | PASS | Vite production build completed under Node 20, with engine warnings. |
| Frontend authenticated catalog | PASS | Playwright under Node 22 rendered catalog data after real Supabase sign-in. |

## Runtime requirements discovered

- Python: repository states 3.12+, but this host is 3.14. Existing Starlette TestClient tests deadlock under this combination.
- Node: lockfile packages require Node >=22.12. Node 20 builds but fails at runtime when Supabase needs native WebSocket support. Node 22.23.4 was used for successful browser catalog validation.
- Frontend server functions require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at runtime, not only at browser build time.

