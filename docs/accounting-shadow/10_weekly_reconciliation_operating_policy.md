# Accounting without waiting for bank reconciliation

## Policy decision (14 November 2026)
Weekly **manual** reconciliation is a routine finance control, **not** a prerequisite for completing and testing the new ledger, transaction mappings, journals, financial reports, approval workflow and month-end processing.

**Non-negotiable separation:** never imply an ERP transaction has been bank-confirmed simply because a journal was generated. Bank status has its own workflow. Existing ERP operations and reports must remain unchanged until deliberate tested cutover.

## Modules staged in the shadow-accounting branch
1. General ledger: chart of accounts, balanced journal event/line storage, source identity deduplication, reversal-by-opposite-journal policy.
2. Transaction policies: disbursements, repayments (principal vs interest), deposits, withdrawals, fees, remittances, expenses, reversals.
3. Reports: posted journal detail, trial balance, monthly profit and loss, provisional balance-sheet snapshots, daily park cash movement and source-operational monthly reporting.
4. Controls: accounting periods, source mappings, opening balance drafts, adjustment requests and evidence/approval status.
5. Weekly manual reconciliation: reconciliation runs per bank and date range, statement line registers, suggested/confirmed/rejected matches, reviewer identity and statement-level variance.
6. Controls and exceptions: unmapped source types, possible transfers incorrectly recorded as expenses, duplicate or broken source links, unbalanced journals and unresolved bank exceptions.

All new SQL remains in `docs/accounting-shadow` on a dedicated branch; scripts are **not** installed or automatically run. No real money has been journal-posted by the new ledger.

## Weekly manual bank reconciliation (routine)
1. Export each bank's statement for the previous week. Confirm bank, currency, date range, opening/closing balance and full transaction detail.
2. Export the ERP remittances and disbursement schedules for the same period plus a few days either side for value-date differences.
3. Match by bank, date, amount and reference; include customer name in narration where a family member received a disbursement. Such a match remains provisional until finance confirms the actual beneficiary.
4. Investigate one-to-many payments, amount mismatches, duplicate disbursements, unreceived transfers, bank fees, and unmatched receipts. Keep all evidence.
5. Categorise each difference as: timing difference, missing ERP entry, missing bank transaction, duplicate, wrong amount, bank fee, legitimate third-party beneficiary, or unidentified.
6. Approve any genuine adjustment; post a separate balancing correcting journal (do not edit historical records).
7. Sign off that week's statement opening + credits - debits = closing; carry unresolved items and cash differences into the next reconciliation run.

Do **not** create a fictitious 'reconciliation expense' for a difference. Unresolved differences belong in an exception register; only supported postings can enter the GL.

## Daily accounting should continue independently
- Loans: journal when real disbursement evidence exists; ERP approvals alone are not evidence of payment.
- Collections: use park cash/collection clearing and record the loan principal/interest allocation.
- Savings: maintain liabilities to customers.
- Remittances: move between cash/clearing and the relevant bank ledger, rather than increasing revenue.
- Expenses: categorize, require approval and attach supporting proof; never treat savings withdrawals as operating expenses.
- Journals: every entry balanced, unique by source, correcting entries retain original evidence.
- Reports: show `provisional` until opening balances and mapping rules are approved.

## Cutover gates are NOT the same as reconciliation cadence
Build and isolated tests: can proceed NOW.
Financial reports as provisional internal management analysis: after source mapping, approved test cases and opening-balance plan.
Official audited figures, certified bank balances, and production posting activation: need controlled cutover, independently verified opening balances and sign-off. Weekly reconciliation continues afterward as normal finance work.

## Protection
- No SQL applied to the production Supabase project.
- No changes to live `main`, Vercel production, ERP tables, or staff screens.
- No automatic bank matching or posting to live journal entries.
- Private schema with no anon/authenticated grant is planned, not yet security-tested on a separate database.
