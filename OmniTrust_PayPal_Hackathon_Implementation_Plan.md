# OmniTrust PayPal AI Hackathon — Production Refactor Plan

**Status:** Implementation plan based on reviewing the public `main` branch of [TaNiShK1911/OmniTrust](https://github.com/TaNiShK1911/OmniTrust). This file does not claim any repository changes have already been made.

## Repository facts and architecture corrections

The repository currently has FastAPI under `backend/app/`, React/Vite with TanStack Router under `frontend/src/routes/_authenticated/`, and the separate logistics FastAPI service at `mock-logistics/backend/`. Existing files include `backend/app/integrations/razorpay_client.py`, `backend/app/services/{escrow_service,settlement_service,dispute_service}.py`, `backend/app/security/webhook_signatures.py`, API routes and lifecycle/webhook tests. Requested UI paths such as `frontend/src/routes/_authenticated/orders/$orderId/settlement.tsx`, `frontend/src/routes/_authenticated/audit/$orderId.tsx`, and `frontend/src/routes/_authenticated/logistics.tsx` exist.

Before code changes, account for these integration constraints:

1. **Do not describe standard PayPal Orders v2 as a native escrow product.** This design is an application-level conditional release workflow around a time-limited authorization. Confirm the actual marketplace/seller payout product before claiming funds are held in escrow or automatically routed to multiple sellers.
2. Create the order using `intent: "AUTHORIZE"` at `POST /v2/checkout/orders`; after buyer approval, authorize it using `POST /v2/checkout/orders/{order_id}/authorize`. Store `purchase_units[0].payments.authorizations[0].id`. Capture through **Payments v2** `POST /v2/payments/authorizations/{authorization_id}/capture`; void through `/v2/payments/authorizations/{authorization_id}/void`. These are not the same as `POST /v2/checkout/orders/{id}/capture`, which applies to the capture-intent order flow. A captured payment cannot be voided; refund it using `/v2/payments/captures/{capture_id}/refund`.
3. Authorizations are time-limited. PayPal documents a three-day honor period and an authorization window up to 29 days in applicable cases. Persist expiry metadata and define reauthorization/expiry handling if shipping may take longer.
4. **Do not implement a made-up `PAYPAL-CHECKSUM` verification scheme.** Configure `PAYPAL_WEBHOOK_ID` for the registered Sandbox webhook and call PayPal's `POST /v1/notifications/verify-webhook-signature` with `paypal-transmission-id`, `paypal-transmission-time`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`, the configured webhook ID, and event JSON. Require `verification_status == "SUCCESS"`. Keep the current HMAC-SHA256 helper for mock logistics events; the two webhook paths are separate.
5. Do not let LLM agents move money. Agents recommend; deterministic policy gates decide; server-side payment services perform provider calls. Do not simulate success on PayPal errors in a non-test environment.
6. The user's proposed `/api/negotiate`, `/api/escrow/*`, and `/api/agents/*` paths do not exactly mirror current API paths. The repository currently uses `/api/v1/negotiations`, `/api/v1/orders/{order_id}/escrow`, and existing versioned API routers. Preserve current contracts first; add clear compatibility aliases only when necessary.
7. AG Grid Master/Detail is an Enterprise feature. `ag-grid-react` installs Community; if Master/Detail is required, secure the Enterprise trial/license, or implement custom expandable detail panels without the Enterprise feature.
8. Bryntum Scheduler is a commercial package with private registry access requirements. Confirm sponsor/trial license and package access before adding it as a mandatory build dependency.
9. Render can host API, static sites, web services, and background workers through `render.yaml`. A Celery worker requires an actual queue (e.g. Redis/Render Key Value). The project includes TanStack Start/Nitro dependencies, so verify whether the frontend is truly deployable as a static site before using the requested static-site service type.
10. Check PayPal Sandbox support for the currency selected by the app. Current backend lifecycle examples use INR; never show INR in UI while sending a different currency to PayPal.

## Target architecture

```text
React + TanStack Router
   | PayPal JS SDK: buyer approval only; never holds server credentials
   v
FastAPI backend -------------------------> PayPal Sandbox REST APIs
   |                                       OAuth2 token
   |                                       Orders v2: create AUTHORIZE order / authorize
   |                                       Payments v2: capture / void / refund
   +-- deterministic gatekeeper + payment state machine
   +-- durable payment transaction rows + idempotency + audit events
   +-- /api/webhooks/paypal (PayPal verification API + event deduplication)
   +-- /api/webhooks/logistics (existing HMAC validation + event deduplication)
   +-- OpenAPI -> APIMatic SDKs (Python and TypeScript)
   +-- paginated audit/telemetry API -> AG Grid
   +-- timeline API -> Bryntum Scheduler

mock-logistics/backend/ -- signed delivery events --> FastAPI
Render Blueprint -- API + logistics service + frontend + optional worker/queue
```

### Canonical application payment states

Use application states independent of PayPal provider status:

- `PENDING_APPROVAL`: PayPal order created; buyer has not approved.
- `PENDING_AUTHORIZATION`: buyer approved; backend authorization is in progress.
- `FUNDS_AUTHORIZED`: PayPal confirms authorization; funds are held by PayPal under an authorization, not released to seller.
- `CAPTURE_PENDING`: settlement gate passed; capture submitted or outcome requires reconciliation.
- `CAPTURED_AND_SETTLED`: PayPal confirms capture and the payment is correlated to the correct order/authorization.
- `VOID_PENDING` -> `VOIDED`: uncaptured authorization voided.
- `REFUND_PENDING` -> `REFUNDED` / `PARTIALLY_REFUNDED`: captured funds refunded using the capture ID.
- `AUTHORIZATION_EXPIRED`, `PAYMENT_FAILED`, `DISPUTED`: recovery or terminal paths.

Persist amounts using `Decimal` in Python and decimal strings in outbound payloads; do not use binary float for payment calculations. Store authorization ID, capture ID, provider statuses, expiry timestamps, provider event IDs, and one durable idempotency key per monetary operation.

## Phase 0 — Baseline, data model, safety rails

### Tasks

1. Create branch `feat/paypal-ai-hackathon`.
2. Run backend tests, mock-logistics tests, frontend lint/typecheck/build; record baseline results and any tests that require live Supabase services.
3. Add payment-state machine unit tests before migrating the provider.
4. Inspect the repository's actual Supabase migration conventions and `orders` primary-key type before adding migrations.

### Add `backend/migrations/20261020_paypal_payment_fields.sql` (path/name may change to match project convention)

Prefer a `payment_transactions` table rather than further overloading order fields. Replace `<MATCH_ORDERS_ID_TYPE>` with the actual `orders.id` type before running this migration:

```sql
create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id <MATCH_ORDERS_ID_TYPE> not null references orders(id),
  provider text not null default 'paypal_sandbox',
  paypal_order_id text unique,
  authorization_id text unique,
  capture_id text unique,
  last_refund_id text,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  state text not null,
  provider_order_status text,
  authorization_expires_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists payment_transactions_order_id_idx
  on payment_transactions(order_id, created_at desc);
```

Add equivalent durable storage for PayPal webhook event IDs/transmission IDs with uniqueness constraints. Apply the project's RLS/service-role policies. Do not drop old fields during the first migration until a schema/data review is complete.

## Phase 1 — Razorpay removal and PayPal REST integration

### 1.1 Modify `backend/app/config.py`

- Delete `razorpay_key_id`, `razorpay_key_secret`, and `razorpay_configured`.
- Add settings:

```python
paypal_client_id: str = ""
paypal_client_secret: str = ""
paypal_base_url: str = "https://api-m.sandbox.paypal.com"
paypal_webhook_id: str = ""
paypal_return_url: str = "http://localhost:3000/paypal/return"
paypal_cancel_url: str = "http://localhost:3000/paypal/cancel"

@property
def paypal_configured(self) -> bool:
    return bool(self.paypal_client_id and self.paypal_client_secret)
```

- In production, require a configured logistics webhook secret and remove the current Razorpay-branded default secret. Use one shared local-only development secret in backend and mock logistics environment config.
- Validate that Sandbox base URL is explicit in demo deployments; never let request input select arbitrary provider hosts. Keep secret values out of health responses and logs.
- Clear cached settings in tests when changing environment variables.

### 1.2 Modify `backend/requirements.txt`

- Remove `razorpay>=1.4.2`.
- Retain `httpx`; no PayPal SDK is required if using REST directly.
- Add Celery only if the background worker is implemented in this project; do not add unused packages.

### 1.3 Add `backend/app/integrations/paypal_client.py`

Use `httpx.AsyncClient`, OAuth2 client credentials, explicit timeouts, sanitized errors, cached OAuth tokens with expiry skew, and `PayPal-Request-Id` on mutating calls. Use one shared client with lifespan cleanup, or inject it from dependencies. Never print token/client-secret headers.

Implement these methods (the snippets show the essential API paths, not a complete drop-in module):

```python
async def create_order_authorization(
    amount: Decimal, currency: str, order_id: str, request_id: str
) -> dict:
    return await request("POST", "/v2/checkout/orders", request_id=request_id, json={
        "intent": "AUTHORIZE",
        "purchase_units": [{
            "reference_id": order_id,
            "custom_id": order_id,
            "invoice_id": order_id[:127],
            "amount": {
                "currency_code": currency,
                "value": format(amount.quantize(Decimal("0.01")), ".2f"),
            },
        }],
        "application_context": {
            "return_url": settings.paypal_return_url,
            "cancel_url": settings.paypal_cancel_url,
            "user_action": "PAY_NOW",
        },
    })

async def authorize_order(order_id: str, request_id: str) -> dict:
    return await request(
        "POST", f"/v2/checkout/orders/{order_id}/authorize",
        json={}, request_id=request_id,
    )

async def capture_authorization(authorization_id: str, request_id: str) -> dict:
    return await request(
        "POST", f"/v2/payments/authorizations/{authorization_id}/capture",
        json={}, request_id=request_id,
    )

async def void_authorization(authorization_id: str, request_id: str) -> dict:
    return await request(
        "POST", f"/v2/payments/authorizations/{authorization_id}/void",
        json={}, request_id=request_id,
    )

async def refund_capture(
    capture_id: str, request_id: str,
    amount: Decimal | None = None, currency: str | None = None,
) -> dict:
    payload = {} if amount is None else {"amount": {
        "currency_code": currency,
        "value": format(amount.quantize(Decimal("0.01")), ".2f"),
    }}
    return await request(
        "POST", f"/v2/payments/captures/{capture_id}/refund",
        json=payload, request_id=request_id,
    )
```

Implementation details:

- Token endpoint: `POST /v1/oauth2/token`, HTTP Basic auth (`client_id:client_secret`), form field `grant_type=client_credentials`. Cache `access_token` until shortly before `expires_in`; protect refresh with an async lock to prevent token stampedes.
- Include `Content-Type: application/json`, `Authorization: Bearer <token>`, and appropriate `Prefer: return=representation` headers. Parse provider failures into a `PayPalError` with status/request ID and sanitized details.
- Validate positive finite Decimal amount and allowed uppercase currency before making requests.
- Persist request IDs before the provider call. On capture timeout, reuse the same idempotency ID when retry is safe and reconcile through provider status/webhook; never create a fresh ID and risk a duplicate capture.
- Do not build a silent “simulation success” fallback into the real adapter. Tests should inject a fake adapter explicitly.

### 1.4 Delete `backend/app/integrations/razorpay_client.py` after rewiring imports

The current adapter uses Razorpay virtual accounts/transfers/refunds and can fall back to simulated results. Delete it only after all consumers and tests have been rewired. Current known consumers include:

- `backend/app/services/escrow_service.py`
- `backend/app/services/settlement_service.py`
- `backend/app/services/dispute_service.py`
- `backend/app/api/health.py`
- `backend/tests/test_e2e_full_lifecycle.py`
- additional test files/scripts/docs found by repo-wide search.

Do not map `create_virtual_account()` directly to PayPal order creation and treat it as a held payment. Do not map `route_transfer()` to capture and imply automatic seller routing; verify the actual merchant/platform payout model first.

### 1.5 Rewrite `backend/app/services/escrow_service.py`

Keep compatibility with the current route temporarily, but introduce explicit internal methods:

- `create_payment_order`: authorize user/order; validate order status, amount, currency, and idempotency; call PayPal create order; persist PayPal order ID and `PENDING_APPROVAL`; return the public approval URL from the `links` entry with `rel=approve`.
- `authorize_payment`: only accept a PayPal order ID already associated with the authenticated OmniTrust order; call Orders v2 authorize after buyer approval; extract `purchase_units[].payments.authorizations[]`; persist authorization ID, provider status, amount, currency, expiry metadata, and `FUNDS_AUTHORIZED` only after provider confirms authorization.
- An order created or approved by the buyer is not, by itself, proof that funds are authorized.
- Ensure ownership, auth role, and order-to-provider-ID associations are checked server-side. Never trust client-submitted amount, authorization ID, capture ID, or seller account.

### 1.6 Rewrite `backend/app/services/settlement_service.py`

- Keep `run_settlement_checks` as mandatory gatekeeper. Require: correct state `FUNDS_AUTHORIZED`, verified delivery, no open dispute, correct amount/currency, non-expired authorization, not already captured, no operation in progress, and a valid persisted authorization ID.
- Execute `capture_authorization()` only after the gate passes. Persist `CAPTURE_PENDING` before provider call. Mark `CAPTURED_AND_SETTLED` only on confirmed provider capture or a verified `PAYMENT.CAPTURE.COMPLETED` event.
- If provider outcome is unknown after timeout, mark pending/reconciliation state and do not set settled or blindly retry with a different idempotency key.
- Standard merchant capture settles to the receiving merchant; it does not automatically pay an arbitrary marketplace seller. The initial demo should accurately label its receiving merchant flow unless a supported PayPal platform product with seller onboarding/payout rights is implemented.

### 1.7 Rewrite refund handling in `backend/app/services/dispute_service.py`

- For a full, uncaptured authorization: call `void_authorization()`. PayPal void is all-or-nothing.
- For a captured payment: call `refund_capture(capture_id, ...)`, using a full or partial amount as allowed by policy and provider rules.
- Never issue a partial refund against an uncaptured authorization by pretending void supports partial amounts.
- Keep arbitrator agent as recommendation-only. Apply the existing deterministic refund cap and state preconditions before calling PayPal. Audit whether the result was void/refund, not one generic “refunded” status.

### 1.8 Add `backend/app/api/paypal_webhooks.py`

- Add `POST /api/webhooks/paypal` as a separate router from `backend/app/api/webhooks.py` (which currently verifies mock-logistics HMAC).
- Read and validate the request body/headers, call PayPal `POST /v1/notifications/verify-webhook-signature` using configured `PAYPAL_WEBHOOK_ID`, transmission headers and event JSON, then require `verification_status == "SUCCESS"`.
- Deny missing headers, mismatched registration, verification failure, malformed events, and unknown/mismatched payment references. Persist event ID/transmission ID before state mutation; uniqueness and DB transaction handling must prevent duplicate capture/refund effects.
- Handle at least `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, and relevant refund-failure events.
- Correlate event IDs to stored PayPal order/authorization/capture IDs and internal order ID. Provider webhooks may arrive more than once or out of order; apply only legal state transitions and reconcile safely.
- Keep the existing HMAC methods in `backend/app/security/webhook_signatures.py` for logistics and add PayPal-specific verification code separately.

### 1.9 Modify API/router/config files

**`backend/app/api/escrow.py`** — current router uses prefix `/api/v1/orders`. Add/transition to:

- `POST /api/v1/orders/{order_id}/paypal-order` — create PayPal order, return order ID and approval URL.
- `POST /api/v1/orders/{order_id}/authorize` — authorize the already-associated approved order.
- `GET /api/v1/orders/{order_id}/payment` — return sanitized payment state/status/expiry.
- `POST /api/v1/orders/{order_id}/capture` — invoke gate and capture the persisted authorization.
- `POST /api/v1/orders/{order_id}/void` — void an eligible uncaptured authorization.

Keep `/api/v1/orders/{order_id}/escrow` temporarily as deprecated compatibility routes if the current frontend relies on them. A compatibility facade for `/api/escrow/authorize` can be added if required by the hackathon spec, but it must use the same auth/service implementation.

**`backend/app/main.py`** — update FastAPI title/description from the former Razorpay Buildathon wording, include PayPal webhook router, keep request-ID/error handling and existing route compatibility.

**`backend/app/api/health.py`** — replace Razorpay dependency status with PayPal readiness; health response must never include secrets. Keep liveness separate from optional provider readiness.

**`backend/app/db/queries.py`** or new **`backend/app/db/payment_queries.py`** — add typed CRUD functions for payment transactions, webhook events, unique idempotency keys, and state transitions. Do not scatter arbitrary table writes across routers.

**`backend/app/services/idempotency_service.py`** — support a persisted unique operation key per create/authorize/capture/void/refund and webhook deduplication. Existing audit-event-only idempotency is insufficient to protect concurrent requests without a database uniqueness/locking strategy.

**`backend/app/services/audit_service.py`** — add sanitized PayPal event and state transition audit events.

**`backend/app/api/orders.py`** and **`backend/app/api/disputes.py`** — expose timeline/payment status and update output semantics as needed without removing route compatibility prematurely.

## Phase 2 — Replace frontend checkout

### Modify these files

- `frontend/package.json`: add `@paypal/react-paypal-js` and its compatible `@paypal/paypal-js` dependency.
- `frontend/src/routes/_authenticated/orders/$orderId/settlement.tsx`: remove Razorpay UI, add PayPal buyer approval flow, show payment state, authorization/capture IDs and authorization expiry. The current page calls a settlement server function; replace it with payment-state-aware functions.
- `frontend/src/lib/omni.functions.ts`: add server functions for create PayPal order, authorize, capture, void, payment-state lookup, and timeline/audit reads, using existing session/auth propagation.
- `frontend/src/routes/_authenticated/orders/$orderId/index.tsx`: add payment status and references.
- `frontend/src/routes/_authenticated/dashboard.tsx`: update payment provider language and expose payment-state summary.
- `frontend/src/routeTree.gen.ts`: regenerate after new routes; do not hand-edit generated router configuration.
- root `README.md` and `backend/README.md`: update setup instructions and PayPal Sandbox environment variables.

### Checkout behavior sketch

```tsx
<PayPalScriptProvider options={{
  clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
  currency: currencyCode,
  intent: "authorize",
}}>
  <PayPalButtons
    createOrder={async () => {
      const result = await createPayPalOrder({ data: { orderId } });
      return result.paypalOrderId; // backend created order with intent=AUTHORIZE
    }}
    onApprove={async (data) => {
      // Backend validates order ownership and provider association, then authorizes.
      await authorizePayPalOrder({ data: { orderId, paypalOrderId: data.orderID } });
      await paymentQuery.refetch();
    }}
    onCancel={() => {/* no authorization is assumed; show buyer-cancelled state */}}
    onError={() => {/* display safe diagnostic ID; never dump headers/payment source */}}
  />
</PayPalScriptProvider>
```

Do not capture within `onApprove`; capture only after the shipment/dispute/gate flow allows it. `VITE_PAYPAL_CLIENT_ID` is public; `PAYPAL_CLIENT_SECRET` is server-only and must never use the `VITE_` prefix. Test cancel, approval errors, browser reload, duplicate click, timeout, and expired authorization states.

## Phase 3 — AG Grid Agentic Audit Command Center

### Dependencies

Modify `frontend/package.json`; install `ag-grid-react` and `ag-grid-community` at matching versions. For actual Master/Detail rows, obtain AG Grid Enterprise and configure the license per the vendor's guidance. Otherwise use Community Grid plus custom expandable details.

### File changes

Modify:
- `frontend/src/routes/_authenticated/dashboard.tsx`
- `frontend/src/routes/_authenticated/audit/$orderId.tsx`
- `backend/app/api/audit.py`
- `backend/app/services/audit_service.py`
- `backend/app/db/queries.py` if needed for bounded audit queries

Add:
- `frontend/src/components/audit/AgentAuditGrid.tsx`
- `frontend/src/components/audit/AgentDetailPanel.tsx`
- `frontend/src/lib/audit.types.ts`

### Columns / data contract

| Column | Contract |
|---|---|
| Order ID | Internal order identifier; display shortened form with safe copy action |
| Buyer Agent Bid | Structured buyer proposal amount |
| Seller Counteroffer | Structured seller proposal amount |
| Consensus Score (%) | Only show if a defined algorithm computes it; label the score source; never invent a value |
| Logistics Proof Hash | Actual computed proof digest, or “not available” until one exists |
| Payment State | Canonical app state, not a stale provider-independent label |
| PayPal Authorization ID | Stored authorization ID; never display token/client secret |

The current agents emit structured proposals/decisions and human-readable messages. Do **not** collect or display hidden chain-of-thought/raw private LLM reasoning logs. Display structured decision, human-visible rationale, model ID, latency, fallback-vs-AI flag, deterministic gate checks, and redacted request/response metadata. Add cursor/page-based queries and polling (3–5 seconds) first. WebSocket/SSE is optional after the read API stabilizes.

### Component sketch

```tsx
const columnDefs = [
  { field: "order_id", headerName: "Order ID", minWidth: 170 },
  { field: "buyer_bid", headerName: "Buyer Agent Bid", valueFormatter: moneyFormatter },
  { field: "seller_counteroffer", headerName: "Seller Counteroffer", valueFormatter: moneyFormatter },
  { field: "consensus_score_pct", headerName: "Consensus Score (%)" },
  { field: "logistics_proof_hash", headerName: "Logistics Proof Hash" },
  { field: "payment_state", headerName: "Payment State", cellRenderer: PaymentStateBadge },
  { field: "authorization_id", headerName: "PayPal Authorization ID" },
];
```

Implement stable row IDs, loading/empty/error UI, server pagination, useful filters/sorts, keyboard support, and redaction at the backend (not merely frontend rendering).

## Phase 4 — APIMatic SDKs and Agent Developer Hub

### Files to modify/add

Modify `backend/app/main.py` to update API metadata/version/tags and ensure Pydantic schemas fully describe payment states, money fields, auth, idempotency, errors, and examples. Existing route groups should be represented rather than claiming non-existent endpoints.

Add:
- `api/openapi.json` — generated from the running FastAPI app, if repository policy keeps the spec in source control.
- `api/README.md` — spec versioning, lint and regeneration commands.
- `.github/workflows/openapi-sdk.yml` — lint OpenAPI and generate/test SDKs if APIMatic credentials are available to CI.
- `frontend/src/routes/_authenticated/developer-hub.tsx` — “Agent Developer Hub” route.
- `frontend/src/components/developer/CodeSnippet.tsx` — reusable code snippets/copy UX.
- `frontend/src/lib/sdk-examples.ts` — tested examples for Python and TypeScript.
- Optional `sdk/python/` and `sdk/typescript/` directories for generated SDKs, depending on APIMatic output strategy.

### Workflow

1. Stabilize FastAPI operation IDs, schemas, security schemes, tags, deprecation fields and response models.
2. Export `/openapi.json` to `api/openapi.json` in CI and fail if the committed spec is stale.
3. Generate Python and TypeScript SDKs using APIMatic from the same versioned spec. Treat generated files as outputs; do not hand-edit generated implementation files.
4. Test SDK flows, especially `backend/app/agents/external_buyer_agent.py` or a dedicated external buyer example, against mocked or staging endpoints.
5. The Hub should include authentication setup, base URL, Python/TypeScript tabs, idempotency examples, request/response/error examples, API version, Sandbox disclaimer, and links/embedding for the APIMatic-generated reference portal.
6. SDK credentials authenticate against OmniTrust; they must not include PayPal client secret or server token. An external agent may negotiate within a spending cap but cannot bypass user approval or settlement gate.

Recommended groups: Negotiations, Orders, Payments, Agents, Audit, and Logistics. Do not publish private webhook-verification internals or mock-only mutation APIs in the external SDK by default.

## Phase 5 — Bryntum Escrow & Logistics Timeline

### Files

Modify:
- `frontend/package.json` (add Bryntum Scheduler React package and styles after confirming registry/license)
- `frontend/src/routes/_authenticated/logistics.tsx`
- `frontend/src/routes/_authenticated/orders/$orderId/settlement.tsx`
- `backend/app/api/orders.py` or add `backend/app/api/timeline.py`
- `mock-logistics/backend/app/routes/events.py`
- `mock-logistics/backend/app/services/webhook_service.py`

Add:
- `frontend/src/components/timeline/EscrowLifecycleTimeline.tsx`
- `frontend/src/lib/timeline.types.ts`

### Timeline event contract

Timeline events must come from persisted audit/provider/logistics events; do not infer dates for milestones that never occurred. Represent:

1. Price negotiation agreed.
2. PayPal Order created / buyer approval.
3. PayPal authorization confirmed.
4. Carrier pickup (only if actual provider event exists).
5. Waypoint in transit (only if actual scan exists).
6. Signed delivery proof verified.
7. Arbitrator decision, if a dispute exists.
8. PayPal capture, void, or refund confirmed.

Add normalized logistics event fields such as `event_id`, `tracking_id`, `order_id` where safe, `event`, `status`, `timestamp`, and `proof_hash`. Mock logistics must keep signing events with the configured shared HMAC secret; it should never directly call PayPal. Combine payment/logistics/arbitration data through one order timeline API. Poll for updates initially; add SSE/WebSocket later if useful. Provide a textual accessible event list fallback and a license-safe fallback if Bryntum cannot be loaded.

## Phase 6 — Render Blueprint

### Add root `render.yaml`

Intended services:

1. `omnitrust-api`: Python web service rooted at `backend`, install `requirements.txt`, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`.
2. `omnitrust-logistics`: Python web service rooted at `mock-logistics/backend`, install its requirements, run `uvicorn main:app --host 0.0.0.0 --port $PORT`, health check `/health`.
3. `omnitrust-frontend`: static site only if verified compatible with the built output and server function architecture. Otherwise deploy TanStack Start as a Node web service. For a verified Vite static output use `npm ci && npm run build`, publish `dist`.
4. `omnitrust-worker`: include only after async work genuinely uses Celery, a Celery app/task module, and an actual Redis-compatible queue.
5. Queue resource (Render Key Value/Redis or supported external queue) only if worker is implemented.

Example baseline skeleton (verify current Render Blueprint syntax and TanStack Start output before deploying):

```yaml
services:
  - type: web
    name: omnitrust-api
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
    envVars:
      - key: APP_ENV
        value: production
      - key: PAYPAL_CLIENT_ID
        sync: false
      - key: PAYPAL_CLIENT_SECRET
        sync: false
      - key: PAYPAL_WEBHOOK_ID
        sync: false
      - key: PAYPAL_BASE_URL
        value: https://api-m.sandbox.paypal.com
      - key: GROQ_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_JWT_SECRET
        sync: false
      - key: LOGISTICS_WEBHOOK_SECRET
        sync: false

  - type: web
    name: omnitrust-logistics
    runtime: python
    rootDir: mock-logistics/backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      - key: LOGISTICS_WEBHOOK_SECRET
        sync: false
      - key: OMNITRUST_WEBHOOK_URL
        value: https://REPLACE_WITH_API_HOST/api/webhooks/logistics

  - type: web
    name: omnitrust-frontend
    runtime: static
    rootDir: frontend
    buildCommand: npm ci && npm run build
    staticPublishPath: dist
    envVars:
      - key: VITE_API_URL
        value: https://REPLACE_WITH_API_HOST
      - key: VITE_PAYPAL_CLIENT_ID
        sync: false
      - key: VITE_LOGISTICS_URL
        value: https://REPLACE_WITH_LOGISTICS_HOST
```

- Replace placeholders with real service URLs/references once service names and hosts exist. Check `staticPublishPath` relative to `rootDir` and verify actual output.
- Current `frontend/package.json` contains `@tanstack/react-start` and `nitro`; static-only hosting may break server functions/SSR. Validate with a Render preview deployment before locking this layout.
- Static-site env variables are build-time values. Only public IDs and API URLs belong in `VITE_*`; all secrets must remain backend/Render secrets.
- Register PayPal webhook URL as `https://<api-host>/api/webhooks/paypal` and use the actual webhook ID belonging to that exact Sandbox webhook.
- Tighten CORS to configured origins. The current mock logistics backend uses permissive wildcard settings; do not keep wildcard credentials in the deployed configuration.
- If async work is not implemented yet, do not define a decorative Celery service. If it is implemented, add `backend/app/celery_app.py`, `backend/app/worker.py`, a queue resource, task idempotency/retries, worker health/monitoring, and graceful shutdown.

## Phase 7 — Security, audit and operations

Modify `backend/app/services/audit_service.py`, API schemas and auth checks as necessary:

- Audit payment state transitions, sanitized provider status/error codes, request/event IDs, amount/currency, gate results, actor, and operation latency.
- Never log client secrets, OAuth tokens, Authorization headers, full PayPal signatures, payer/payment-source PII, or chain-of-thought.
- Provider/network errors must not fall back to a “simulated success” unless an explicit test-only mock adapter has been injected.
- Validate ownership and role before create/authorize/capture/void/refund. Frontend input never determines amount or internal target seller/account.
- Keep explicit request IDs, timeouts, rate limits where practical, webhook deduplication, and reconciliation for ambiguous capture results.
- Restrict CORS to configured deployed frontend origins. Separate liveness (`/api/health`) from provider/database readiness where appropriate.

## Complete file-by-file change inventory

### Existing files to modify

| File | Planned change |
|---|---|
| `backend/app/config.py` | Replace Razorpay settings with PayPal Sandbox credentials, base URL, webhook ID, return/cancel URLs; remove insecure default secrets |
| `backend/requirements.txt` | Remove Razorpay package; keep `httpx`; add Celery only if used |
| `backend/app/main.py` | Update project metadata; include PayPal webhook router; preserve existing API compatibility |
| `backend/app/api/health.py` | Report PayPal readiness without secrets |
| `backend/app/services/escrow_service.py` | Implement order creation, approval/authorization, persisted provider IDs and real state checks |
| `backend/app/services/settlement_service.py` | Capture stored authorization only after deterministic gate; reconcile pending outcomes |
| `backend/app/services/dispute_service.py` | Void uncaptured authorization; refund captured payment using capture ID |
| `backend/app/api/escrow.py` | Add payment creation, authorization, state, capture and void routes; deprecate old aliases after UI migration |
| `backend/app/api/webhooks.py` | Retain existing signed logistics webhook; do not convert it to PayPal verification |
| `backend/app/api/disputes.py` | Align dispute/refund response semantics and states |
| `backend/app/api/orders.py` | Add/extend payment-aware order timeline and state response |
| `backend/app/db/queries.py` or new `backend/app/db/payment_queries.py` | Add durable payment transaction + PayPal event persistence |
| `backend/app/services/idempotency_service.py` | Enforce durable operation IDs and safe concurrency control |
| `backend/app/services/audit_service.py` | Add redacted PayPal payment audit events |
| `backend/app/security/webhook_signatures.py` | Keep current HMAC helper for logistics; PayPal verification should be a separate API method/module |
| `backend/app/api/audit.py` | Add typed/paginated grid telemetry API if current output does not already satisfy contract |
| `backend/app/api/negotiation.py` | Add operation IDs, typed request/response metadata if needed for OpenAPI/SDK |
| `frontend/package.json` | Add PayPal React SDK, AG Grid, Bryntum packages only with license/compatibility confirmed |
| `frontend/src/routes/_authenticated/orders/$orderId/settlement.tsx` | Replace Razorpay checkout with PayPal authorization and gated capture state |
| `frontend/src/routes/_authenticated/orders/$orderId/index.tsx` | Show payment state, expiry, provider references and audit route |
| `frontend/src/routes/_authenticated/dashboard.tsx` | Add payment-state dashboard and audit grid |
| `frontend/src/routes/_authenticated/audit/$orderId.tsx` | Add AG Grid / safe agent evidence view |
| `frontend/src/routes/_authenticated/logistics.tsx` | Add actual milestone timeline and refresh behavior |
| `frontend/src/lib/omni.functions.ts` | Add PayPal payment functions and audit/timeline read functions |
| `frontend/src/routeTree.gen.ts` | Regenerate after adding Developer Hub route |
| `mock-logistics/backend/app/config.py` | Require the shared logistics HMAC secret in deployment; remove Razorpay-branded fallback value |
| `mock-logistics/backend/app/routes/health.py` | Keep `/health`; expose only service status/version |
| `mock-logistics/backend/app/routes/events.py` | Add normalized timeline event access if needed |
| `mock-logistics/backend/app/services/webhook_service.py` | Add proof hash/normalized event fields if implemented; keep signing behavior |
| `mock-logistics/backend/main.py` | Verify health route and production CORS configuration |
| `README.md` | Replace Razorpay messaging and setup; document payment limitations and the new sponsor tools |
| `backend/README.md` | PayPal Sandbox, keys, webhooks and tests |
| `backend/tests/test_e2e_full_lifecycle.py` | Use injected/mock PayPal provider by default; assert authorization then capture/void/refund |
| `backend/tests/test_webhook_signatures.py` | Keep as logistics HMAC tests; replace Razorpay-branded fake secret with neutral test secret |
| `backend/tests/test_webhook_replay.py` | Keep logistics replay test; add separate PayPal webhook event dedupe coverage |
| Other `backend/tests/*` that import `razorpay_client` or assert old `held/released/refunded` meanings | Search and update all provider fixtures and state assertions |
| `mock-logistics/backend/requirements.txt` | No PayPal dependency needed; retain FastAPI/logistics dependencies |

### New files to add

| File | Purpose |
|---|---|
| `backend/app/integrations/paypal_client.py` | OAuth2 token handling and PayPal Orders v2/Payments v2 REST calls |
| `backend/app/api/paypal_webhooks.py` | Official webhook verification, event correlation, deduplication and state updates |
| `backend/app/services/payment_service.py` | Unified payment transaction orchestrator and legal state transitions (recommended) |
| `backend/app/schemas/payments.py` | Payment-state enum, Decimal amount validation and typed provider responses |
| `backend/app/db/payment_queries.py` | Payment transaction and webhook-event persistence if not kept in existing query module |
| `backend/migrations/20261020_paypal_payment_fields.sql` | Payment transaction schema and unique indexes; adapt to actual migration convention |
| `backend/tests/test_paypal_client.py` | OAuth, API requests, error handling, timeouts, idempotency, amount validation |
| `backend/tests/test_paypal_webhooks.py` | Verification failures, header checks, unknown event, replays and duplicate events |
| `backend/tests/test_payment_state_machine.py` | Allowed and forbidden state transitions / settlement invariants |
| `frontend/src/components/audit/AgentAuditGrid.tsx` | AG Grid command center |
| `frontend/src/components/audit/AgentDetailPanel.tsx` | Safe, structured agent decision/gate details |
| `frontend/src/lib/audit.types.ts` | Typed audit/telemetry records |
| `frontend/src/routes/_authenticated/developer-hub.tsx` | APIMatic SDK links and agent integration walkthroughs |
| `frontend/src/components/developer/CodeSnippet.tsx` | Reusable accessible code snippets/copy UX |
| `frontend/src/lib/sdk-examples.ts` | Tested Python/TypeScript code samples |
| `frontend/src/components/timeline/EscrowLifecycleTimeline.tsx` | Bryntum Scheduler integration or gated fallback |
| `frontend/src/lib/timeline.types.ts` | Canonical lifecycle event type |
| `api/openapi.json` | Generated OpenAPI spec if kept in Git |
| `api/README.md` | Spec versioning and generation instructions |
| `.github/workflows/openapi-sdk.yml` | OpenAPI validation and APIMatic generation/checks if credentials are available |
| `render.yaml` | Render Blueprint for API/logistics/frontend and optional worker/queue |
| `backend/app/celery_app.py`, `backend/app/worker.py` | Only if real async queue functionality is needed |

### Files to delete

- `backend/app/integrations/razorpay_client.py` — after all imports, tests and docs have migrated.
- Razorpay-only dependency and lockfile entries, environment keys, UI scripts, sample config, seed text, and current references in README/API descriptions. Preserve a historical note only when it is genuinely useful; the shipped functionality and UI should be Razorpay-free.

## Migration checklist — execution order

### Commit 1: baseline and state contract
- [ ] Create `feat/paypal-ai-hackathon` branch.
- [ ] Run existing backend, mock-logistics, frontend lint/typecheck/build suites; save outputs.
- [ ] Write `PaymentState` enum and legal transition tests before provider rewiring.
- [ ] Check `.gitignore` and env-file conventions; never commit credentials.

### Commit 2: schema and config
- [ ] Add payment transaction and webhook event persistence with DB-level unique keys.
- [ ] Add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_BASE_URL`, `PAYPAL_WEBHOOK_ID`, return/cancel URLs.
- [ ] Add tests for missing/invalid settings and sanitized health payloads.
- [ ] Keep Sandbox base URL as default: `https://api-m.sandbox.paypal.com`.

### Commit 3: REST client
- [ ] Implement OAuth token cache/expiry skew/lock and shared HTTP lifecycle.
- [ ] Implement create-authorize order, authorize order, capture authorization, void authorization and captured-payment refund.
- [ ] Use persisted `PayPal-Request-Id` for every mutation.
- [ ] Test with `httpx.MockTransport`; default CI must not require live Sandbox credentials.
- [ ] Ensure capture calls `/v2/payments/authorizations/{id}/capture`, not the order capture endpoint.

### Commit 4: service layer
- [ ] Rewire escrow, settlement and dispute services to payment orchestrator.
- [ ] Persist pending state before mutation; only set success after provider confirms it.
- [ ] Make ownership and role checks explicit; reject arbitrary browser-supplied provider IDs/amounts.
- [ ] Keep deterministic settlement/refund gates as the only path to capture/void/refund.

### Commit 5: webhook verification and reconciliation
- [ ] Register Sandbox webhook and set its ID in `PAYPAL_WEBHOOK_ID`.
- [ ] Implement official verify-webhook-signature endpoint call and exact header mapping.
- [ ] Persist event IDs and reject duplicates; validate event-to-payment correlation and legal transitions.
- [ ] Test invalid/missing headers, verification failure, duplicated and out-of-order events, mismatched provider IDs and timeout followed by success webhook.
- [ ] Retain all logistics signature/replay tests unchanged in intent.

### Commit 6: remove Razorpay
- [ ] Search case-insensitively for `razorpay`, `RAZORPAY`, `razorpay_test`, `Razorpay Test`, `route_transfer`, `virtual_account`, and `razorpay_hackathon_secret_2026`.
- [ ] Update every import, fixture, README, health check, env example and dependency.
- [ ] Delete `razorpay_client.py` only after no imports remain.
- [ ] Confirm no active Razorpay SDK or checkout script remains in repository/build output.

### Commit 7: frontend checkout
- [ ] Add PayPal React SDK and public `VITE_PAYPAL_CLIENT_ID`.
- [ ] Implement create order -> buyer approval -> backend authorize -> persisted `FUNDS_AUTHORIZED` display.
- [ ] Capture remains blocked until delivery/dispute/gate checks pass.
- [ ] Test cancellation, approval denial, refresh/revisit, duplicate clicks, network timeout, pending capture and authorization expiry.

### Commit 8: AG Grid
- [ ] Confirm Master/Detail license or choose Community-compatible custom expanded details.
- [ ] Add grid and typed, paginated telemetry API.
- [ ] Ensure score/hash values are real and traceable; use structured rationale, not chain-of-thought.
- [ ] Test error/loading/empty states, sort/filter, keyboard/accessibility and pagination.

### Commit 9: APIMatic
- [ ] Stabilize route names, operation IDs, Pydantic schemas and auth docs.
- [ ] Export and lint OpenAPI; version and commit if appropriate.
- [ ] Generate Python and TypeScript SDKs through APIMatic; test both against mock/staging.
- [ ] Add Developer Hub route and regenerate TanStack route tree.
- [ ] Verify no PayPal secret, OAuth token or private payment-source data appears in spec/examples/SDKs/frontend bundle.

### Commit 10: Bryntum
- [ ] Confirm Bryntum license/registry access and current React/Vite compatibility.
- [ ] Build timeline from persisted real events, not invented dates.
- [ ] Integrate signed logistics and verified PayPal lifecycle events into the shared timeline API.
- [ ] Add accessible event-list fallback and dependency/license-aware error handling.

### Commit 11: Render / optional worker
- [ ] Confirm TanStack Start deployment mode before labeling frontend static.
- [ ] Add Render blueprint and verify build/start commands plus all health paths.
- [ ] Configure secrets through Render environment settings; restrict CORS and webhook destination URLs.
- [ ] If Celery is used, add queue, task idempotency, retry/backoff and worker health; otherwise skip worker service.
- [ ] Verify real PayPal Sandbox webhook delivery to deployed API.

### Commit 12: end-to-end acceptance
- [ ] Run backend tests, mock-logistics tests, frontend lint/typecheck/build and payment contract tests.
- [ ] Happy path: negotiate -> order -> approval -> authorize -> shipment -> signed delivery -> gate passes -> capture confirmed -> audit/timeline update.
- [ ] Dispute path: authorize -> damaged shipment -> dispute -> arbitrator recommendation -> void if uncaptured OR refund if captured -> final state/audit.
- [ ] Verify gate blocks capture when authorization/delivery is missing, dispute is open, amount/currency mismatch occurs, authorization expires, or a duplicate capture is attempted.
- [ ] Simulate ambiguous capture timeout and prove there is no blind duplicate payment action.
- [ ] Repeat repo-wide Razorpay search; tag release only once tests and Sandbox walkthrough pass.

## Test coverage to add/update

1. `backend/tests/test_paypal_client.py`: OAuth Basic/form request, token caching and expiry, request payloads, non-2xx failures, sanitized logs, timeouts, request IDs, amount/currency validation.
2. `backend/tests/test_payment_state_machine.py`: valid approval/authorization/capture path; void path; captured refund path; duplicate terminal operations and illegal transitions.
3. `backend/tests/test_paypal_webhooks.py`: only verified messages accepted; webhook ID/header validation; event replay/idempotency; mismatch provider IDs; duplicate notification handling.
4. Update `backend/tests/test_e2e_full_lifecycle.py` to inject a deterministic fake PayPal adapter by default. An opt-in Sandbox test may be separate and never run on normal CI.
5. Preserve `backend/tests/test_webhook_signatures.py`, `backend/tests/test_webhook_replay.py`, and `mock-logistics/backend/tests/*` coverage for HMAC, replay and logistics transitions. PayPal events must not use logistics HMAC validation and logistics events must not go through the PayPal verifier.
6. Add frontend tests for buyer cancel/error, payment-state polling, double submit and gated capture. Keep existing build/typecheck green after installing licensed/grid packages.

## Acceptance criteria

- [ ] No active Razorpay imports, package dependency, environment keys or UI strings.
- [ ] All PayPal mutations are server-side; client secret/token never reaches browser.
- [ ] `FUNDS_AUTHORIZED` only follows PayPal authorization confirmation; capture only follows deterministic settlement gate.
- [ ] Void is used for uncaptured authorization; refunds reference the captured payment ID.
- [ ] PayPal webhook validation and deduplication coexist with, but remain separate from, logistics HMAC/replay validation.
- [ ] PayPal provider failures never turn into simulated success.
- [ ] Audit displays safe structured evidence; no private chain-of-thought is stored or displayed.
- [ ] AG Grid/Bryntum license and registry requirements are satisfied, or disclosed fallback exists.
- [ ] APIMatic produces tested Python and TypeScript SDKs from the versioned OpenAPI spec.
- [ ] Render services have working health checks, correctly scoped origins, environment secrets, and a real queue if worker is deployed.
- [ ] Baseline tests pass or behavior changes have explicit updated tests.

## Devpost pitch copy

### OmniTrust — Trusted Commerce for Autonomous Agents

OmniTrust lets AI buyer and seller agents negotiate B2B deals while deterministic policy gates—not an LLM—control financial actions. PayPal Sandbox Orders v2 initiates buyer approval and Payments v2 authorization holds funds until verified logistics evidence and dispute checks satisfy the release policy. PayPal payment events and signed shipment events are reconciled into an auditable transaction history. AG Grid provides an operator-facing Agentic Audit Command Center; Bryntum visualizes negotiation-to-delivery milestones; APIMatic generates Python and TypeScript SDKs so external agents can integrate against a versioned API; and Render packages the API, logistics simulator, frontend, and optional background worker into reproducible cloud infrastructure.

The result is a demonstration of agentic commerce with bounded autonomy, human-readable evidence, explicit payment states, idempotent provider operations, and a strict separation between AI recommendations and money movement. PayPal authorization is a time-limited conditional hold; OmniTrust does not claim that standard PayPal Orders v2 is itself a third-party custodial escrow service.

## Official reference links

- PayPal Orders API integration: https://developer.paypal.com/api/rest/integration/orders-api
- PayPal authorize/capture concepts: https://developer.paypal.com/whats-an-order/
- PayPal webhook verification: https://developer.paypal.com/api/rest/webhooks/rest/
- PayPal void authorization: https://developer.paypal.com/checkout/void-authorized-payment/
- PayPal captured payment refund: https://developer.paypal.com/checkout/refund-payment
- AG Grid installation: https://www.ag-grid.com/react-data-grid/installation/
- AG Grid Master/Detail: https://www.ag-grid.com/react-data-grid/master-detail/
- APIMatic SDK generation: https://docs.apimatic.io/generate-sdks/overview-sdks/
- Bryntum Scheduler React integration: https://www.bryntum.com/products/scheduler/docs/guide/Scheduler/quick-start/react
- Render Blueprint reference: https://render.com/docs/blueprint-spec
- Render background workers: https://render.com/docs/background-workers
