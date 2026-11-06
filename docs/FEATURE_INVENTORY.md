# Feature inventory

| Feature | UI | FastAPI/API | Persistence/integration | Existing test | Audit status |
|---|---|---|---|---|---|
| Auth/profile | `auth.tsx`, onboarding/settings | `/api/v1/auth/*` | Supabase Auth, `profiles` | indirect | PARTIAL |
| Catalog/products | catalog | `/api/v1/products`, agent feed | `products` | catalog feed | PASS for real read/browser render |
| Negotiation/gatekeeper | negotiate | `/api/v1/negotiations/*` | `negotiations`, `audit_events`, Groq | agents/gatekeeper | PARTIAL; browser open stalled, Groq unavailable |
| Orders/timeline | orders | `/api/v1/orders/*` | `orders`, audit | lifecycle | NOT TESTED end-to-end |
| PayPal authorization/capture/void/refund | order detail/checkout | payment, settlement, dispute routes | PayPal Sandbox, `payment_transactions` | PayPal client/state tests | PARTIAL; OAuth only |
| Mock logistics | logistics/shipment pages | shipments/webhooks | mock SQLite, `shipments` | mock logistics suite | PASS health only |
| Disputes/arbitration | dispute page | disputes routes | `disputes`, audit, PayPal | agent/payment tests | NOT TESTED live |
| Audit/metrics/developer hub | audit/dashboard/developer hub | audit/metrics/catalog routes | audit/payment tables | metrics/catalog | PARTIAL |
| Workers | none | Celery tasks | Redis | worker tests | BLOCKED; Redis unavailable |

## Implemented but not demonstrated

PayPal buyer approval, authorization, capture, void, refund, PayPal webhook verification, conditional settlement, dispute financial resolution, worker processing, real Groq calls, and full browser purchase journey require their respective credentials/accounts/infrastructure and were not inferred from source.

