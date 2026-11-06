# Environment audit

## Configuration presence (values redacted)

| Integration | Status | Notes |
|---|---|---|
| Supabase URL/anon/service-role/JWT secret | PASS | present locally; live health query succeeded. |
| PayPal client ID/secret/base URL | PASS | present; base URL is `api-m.sandbox.paypal.com`; live OAuth succeeded. |
| PayPal webhook ID | BLOCKED | absent locally; actual PayPal webhook-signature verification cannot be completed. |
| Groq API key | BLOCKED | absent locally; no real model invocation possible. |
| Logistics signing secret | PASS | backend default matches local mock logistics default. |
| Redis/Celery | BLOCKED | no `REDIS_URL`/local Redis process configured. |
| Frontend public Supabase vars | PASS locally | required in Render frontend service; added to `render.yaml`. |

No secret values are recorded in this document.

