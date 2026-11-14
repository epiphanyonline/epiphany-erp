# Accounting V2 app integration (safe staging)

This branch adds two NEW Next.js paths:

- `/accounting-v2` — informational page only. No financial data fetched. No existing navigation touched.
- `GET /api/accounting-v2/preview?from=YYYY-MM-DD&to=YYYY-MM-DD` — disabled by default, protected read-only aggregate of source transactions. NOT P&L, trial balance, journal, or bank reconciliation. Reads source `transactions` without writes; returns a `truncated` flag if row cap reached.

## Required server-only environment variables (set only in an isolated test deployment)
```
ACCOUNTING_V2_PREVIEW_ENABLED=true
ACCOUNTING_V2_PREVIEW_TOKEN=<random secret with at least 32 characters>
SUPABASE_SERVICE_ROLE_KEY=<server-only secret>
```
Existing `NEXT_PUBLIC_SUPABASE_URL` is read by the route. **Never use `NEXT_PUBLIC_` for service key or preview token.** Do not commit secrets. Do not set the new variables on production.

Request with a trusted server-to-server client and Authorization: Bearer <token>. No token should be entered into a browser UI, localStorage or querystring. This is a temporary staging control; replace with verified staff identity and role-based permissions, audit logging and rate limiting before exposing to real users. Ensure any preview deployment is access-protected.

### Why this is deliberately not linked from the live dashboard
Current `lib/auth.ts` stores the session in `localStorage`; server routes must not trust this data for finance authorisation. The existing `/accounting`, `/profit`, loan and expense pages have not been modified.

### Next implementation gates
1. Create an isolated staging Supabase database; apply and fix the shadow schema there and run tests.
2. Design secure staff sessions on server (e.g., verified signed cookie, login token) without relying on forged localStorage role. Do not change existing login until reviewed.
3. Apply evidence-based journal classification to verified source events, not raw totals.
4. Enable protected ledger reporting only after access controls, tests, and accounting sign-off.
5. Never activate automatic financial posting on production from this prototype.

### Safety
The API only returns gross per-type movements, not names or member data. The response may be capped at 5,000 source rows and never claims completeness if truncated. This is NOT a financial statement and must not be reported as profit.
