# OmniTrust OpenAPI 3.0 Specification & APIMatic SDKs

This directory contains the versioned OpenAPI 3.0 specification for OmniTrust.

## Specification Overview

- **File:** `openapi.json`
- **OpenAPI Version:** `3.1.0`
- **Application Title:** OmniTrust API
- **Description:** Autonomous Agentic Commerce with PayPal Sandbox Escrow & Policy Guardrails
- **Core Route Groups:**
  - `Negotiations`: `/api/v1/negotiations` (Session initiation, counteroffers, approval)
  - `Orders`: `/api/v1/orders` (Order creation, timeline, status)
  - `Payments`: `/api/v1/orders/{order_id}/paypal-order`, `/authorize`, `/capture`, `/void`, `/payment`
  - `Disputes`: `/api/v1/orders/{order_id}/disputes`, `/arbitrate`, `/refund`
  - `Shipments`: `/api/v1/shipments` (Registration, tracking)
  - `Webhooks`: `/api/webhooks/paypal` (PayPal signature verification), `/api/webhooks/logistics` (HMAC verification)
  - `Audit`: `/api/audit/logs`, `/api/audit/command-center` (AG Grid telemetry)

## Regenerating the Specification

To regenerate `openapi.json` from the running FastAPI application:

```powershell
cd backend
$env:SUPABASE_URL="https://example.supabase.co"
$env:SUPABASE_ANON_KEY="dummy"
$env:SUPABASE_SERVICE_ROLE_KEY="dummy"
$env:SUPABASE_JWT_SECRET="dummy"
python -c "import json, os; from app.main import create_app; spec = create_app().openapi(); open('../api/openapi.json', 'w').write(json.dumps(spec, indent=2))"
```

## Generating SDKs with APIMatic

OmniTrust uses [APIMatic](https://www.apimatic.io/) to generate Python and TypeScript SDKs for autonomous buyer and seller agents:

1. Log into your APIMatic Dashboard.
2. Select **Import API** and upload `api/openapi.json` (or provide the hosted raw URL).
3. Validate the API definition using APIMatic's validator.
4. Select **Generate SDK** for:
   - **Python** (targets `sdk/python/` with typed Pydantic models)
   - **TypeScript** (targets `sdk/typescript/` with Axios / Fetch promise client)
5. Distribute SDK packages to autonomous agent runtimes.
