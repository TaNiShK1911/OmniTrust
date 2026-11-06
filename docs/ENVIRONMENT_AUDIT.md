# Environment audit

## Configuration presence (values redacted)

| Integration | Status | Notes |
|---|---|---|
| Supabase URL/anon/service-role/JWT secret | PASS | present locally; live health query succeeded. |
| PayPal client ID/secret/base URL | PASS | present; base URL is `api-m.sandbox.paypal.com`; live OAuth and a minimal USD Orders v2 request succeeded. |
| PayPal webhook ID | PARTIAL | present locally. Missing-header and invalid-signature rejection were executed against the live local handler; a valid signed delivery from PayPal Sandbox has not been received. |
| Groq API key | PRESENT / NOT TESTED | present locally and selected model is configured. No live model request was included in the PayPal-focused audit. |
| Logistics signing secret | PASS | backend default matches local mock logistics default. |
| Redis/Celery | BLOCKED | no `REDIS_URL`/local Redis process configured. |
| Frontend public Supabase vars | PASS locally | required in Render frontend service; added to `render.yaml`. |

No secret values are recorded in this document.

## PayPal currency compatibility

The supplied Sandbox merchant accepts USD but rejects an unconverted INR checkout
request with PayPal's `CURRENCY_NOT_SUPPORTED` response. The approved remediation is
configured locally: source orders remain INR and the backend settles through PayPal
in USD using the explicit QA rate in `PAYPAL_INR_TO_USD_RATE`. The source amount,
currency, settlement amount, settlement currency, and rate are persisted in payment
transaction metadata. This is a fixed, auditable Sandbox QA rate—not a live FX feed
and not suitable for production pricing without a reviewed rate-source policy.

The approved `20261020_paypal_payment_fields.sql` migration was applied through the
shared Supabase pooler connection. The `payment_transactions` and
`paypal_webhook_events` tables now exist and have row-level security enabled.

