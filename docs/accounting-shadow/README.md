# Epiphany Accounting — isolated shadow-ledger build

Branch: `feature/accounting-shadow-ledger-20261114`

## Production safety
- No modifications to current `public.*` tables, existing accounting entries, authentication, repayment schedules, bank reconciliation, or staff UI.
- This SQL lives under `docs/`, NOT `supabase/migrations/`. It will not be applied by deployment tools automatically.
- It has NOT been executed on the production Supabase database. It is a staging design for review/testing.
- New objects live exclusively in private `accounting_shadow` schema. Public/anon/authenticated permissions are revoked. No source-table triggers, subscriptions, cron tasks, or backfill are installed.
- NEVER merge/deploy this script without snapshot backup, dry run, review and accountant approval.

## Intended workflow
1. Reconcile GTBank, FirstBank, Sterling and park cash with actual bank statements and source evidence.
2. Agree opening balances, chart mapping, interest recognition rules and source cutover date.
3. Independently classify ERP financial events in a read-only extraction; produce exceptions for missing/ambiguous classification.
4. Post ONLY reviewed, balanced financial events into the shadow ledger, in a transaction, using `post_reviewed_event`.
5. Compare shadow trial balance with live source balances without changing existing Profit or All Profit.
6. Eventually approve staged integration after a parallel run and sign-off.

## Important accounting policy items to settle
- LOAN_DISBURSEMENT is generally debit principal receivable/credit bank or cash, **only after actual payment confirmed**.
- LOAN_REPAYMENT must be split into principal/interest/fees based on loan agreement and allocation evidence. Cannot assume whole receipt is income.
- SAVINGS_DEPOSIT increases a customer liability; withdrawals decrease it.
- REMITTANCE from park collections to bank is a transfer between cash/clearing and bank, not revenue.
- EXPENSE is subject to evidence, classification, approval, and proof of settlement.
- REVERSAL should post an equal and opposite journal linked to original (future enhancement), never delete originals.
- Any unmatched bank payment / beneficiary mismatch must remain under investigation, including approved family-member beneficiary payments.

## Validation checklist
- Duplicate source event rejected (unique source_type+source_id+event_kind).
- Unbalanced or single-sided entries rejected.
- Zero, negative, mixed debit/credit lines and unknown accounts rejected.
- Only two-decimal NGN amounts accepted.
- Private schema inaccessible to anon/authenticated.
- Source tables unchanged (schema, row counts and checksums independently verified before/after).
- Journal lines sum to zero by entry; no source hooks attached.
- Trial balance correct and opening balances auditable.

## Security follow-up
Supabase inspection reported 9 existing `public` tables without RLS, including disbursement schedules. Do not change their policies in this branch; schedule a separate security review to avoid blocking current staff.
