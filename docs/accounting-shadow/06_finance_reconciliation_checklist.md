# Epiphany accounting stage: reconciliation and historical reporting

**Development branch only. No live deployment, database migration, transaction updates, or staff UI changes.**

## Included files
- `01_isolated_foundation.sql`: private shadow-ledger design (not deployed).
- `02_read_only_classification_audit.sql`: classification review and possible mismatches.
- `03_staging_tests.sql`: synthetic validation, rolled back; run ONLY on an isolated test database.
- `04_park_collection_review.sql`: daily park collections, disbursements and remittance totals.
- `05_historical_reporting.sql`: monthly totals and disbursement schedule linkage exceptions.
- `POSTING_POLICY.md`: evidence-gated debit and credit rules.
- `06_finance_reconciliation_checklist.md`: bank statement and opening-balance controls.

## Required financial evidence
GTBank, FirstBank and Sterling statement exports for the review period, including statement opening and closing balances; ERP transaction export including IDs and references; signed cash count and remittance records by park; approved expense evidence; disbursement schedule; loan terms and interest/principal allocation; documented owner capital and savings balances.

## Reconciliation rules
1. ERP loan repayment/savings receipts recorded at a park are **not** automatically bank deposits.
2. Remittances transfer cash to bank and are **not** profit.
3. Cash disbursement is not automatically a verified GTBank debit. Check bank proof separately.
4. One-to-one matching: bank/date/amount/reference are evidence, not independent proof of beneficiary.
5. A relative's account number may be genuine: matching the customer's name in narration makes it an **investigation candidate**, never a silent clearance.
6. One-to-many, many-to-one, ambiguous or duplicate transactions go to the exception list.
7. No manual editing of original transaction rows or post-cutover ledger adjustments without approval and audit trail.
8. Do not include sensitive customer statements in GitHub.

## Rollout requirements
- Run the read-only reporting queries and verify totals against independent exports.
- Review all exceptions and approve or explicitly carry unresolved ones forward.
- Obtain approved opening balances and interest recognition rules.
- Test shadow ledger in a separate staging database and document balanced posting, idempotency, RLS, negative tests.
- Reconcile and run parallel accounting before considering production activation.

**Known issue to resolve separately:** Nine existing production public tables were reported with RLS disabled, including disbursement schedules. Do not flip these policies without an access review because live staff access could break.
