# Security audit

## Fixed findings

1. **Critical: unauthenticated development fallback.** Missing/invalid bearer tokens created a fixed demo identity. Fixed: all environments now return 401.
2. **Critical: raw Supabase anon/service-role keys accepted as bearer tokens.** Fixed: removed special-case authentication of those keys.
3. **Critical: unverified JWT claims accepted.** Fixed: removed the unverified-claims fallback.
4. **High: IDOR via service-role database reads.** Negotiation, order, shipment, dispute, payment-status, settlement, refund and audit access now enforce record ownership. Live two-user negotiation read was retested and returned 403.
5. **High: frontend server-function demo fallback.** Fixed: missing/invalid browser session now fails instead of forwarding a service-role/anon key.

## Remaining findings

- The global metrics implementation aggregates all records; assess intended tenant visibility before production.
- Mock logistics allows broad CORS and has a demo reset route; keep it isolated from production.
- Render must be configured with the public Supabase runtime variables added to the blueprint.
- Rotate secrets that were pasted into the chat before deploying.

