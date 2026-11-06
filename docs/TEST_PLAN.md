# Test plan and status

## Executed

- FastAPI health and dependency health against live Supabase and local mock logistics.
- Real PayPal Sandbox OAuth token acquisition with Sandbox endpoint assertion.
- Real Supabase QA-account creation, password login, invalid-password rejection, profile write, catalog read, negotiation write, unauthenticated API rejection, and two-user ownership check.
- Playwright: anonymous protected route redirects; real Supabase sign-in; dashboard redirect; authenticated catalog render under Node 22.
- Production frontend build and focused security regression tests.

## Blocked or incomplete

- Groq live tests: missing key.
- PayPal approval/capture/refund: no Sandbox buyer test-account credentials; webhook ID absent.
- Redis/Celery: no broker.
- Full unit suites: TestClient/AnyIO deadlock on host Python 3.14.
- Self-service signup: current Supabase email policy rejected generated QA addresses.
- Full browser purchase journey: catalog-to-negotiation action remained `Opening…` in Playwright and needs a dedicated reproduction/fix.

Mocks in unit tests are not treated as integration evidence.

