# Posting decision register — Epiphany shadow ledger (not live)

Checked 14 November 2026 against read-only Supabase records.

| ERP event | Candidate ledger treatment | Hold / evidence needed |
| --- | --- | --- |
| LOAN_DISBURSEMENT | Dr principal receivable; Cr actual settlement account | ERP CASH channel alone is **not** bank settlement proof. Bank statement or cash-disbursement voucher and original beneficiary details needed. |
| LOAN_REPAYMENT | Dr park cash/collection clearing; Cr principal + interest/fees per contract | Principal/interest allocation absent from basic transaction schema. Do **not** credit whole repayment as profit. |
| SAVINGS_DEPOSIT REGULAR | Dr park cash/clearing; Cr customer regular savings liability | Confirm receipt/cash control. |
| SAVINGS_DEPOSIT COMPULSORY | Dr park cash/clearing; Cr compulsory savings liability | Confirm receipt/cash control. |
| SAVINGS_WITHDRAWAL | Dr relevant savings liability; Cr cash/bank | Cross-check actual payout and member account. |
| REMITTANCE GTB / FIRSTBANK / STERLING | Dr bank; Cr park cash/collections clearing | Confirm matching bank credit and avoid recording the same cash twice. |
| FEE PROCESSING_FEE | Dr cash/clearing or receivable; Cr processing fee income | Confirm fee collected or legally accrued; distinguish withheld disbursement amount. |
| FEE MEMBERSHIP_FEE / CARD_FEE | Dr cash/clearing; Cr applicable fee income | Confirm terms / earning period. |
| EXPENSE | Dr expense, payable settlement, advance, asset or internal transfer; Cr cash/bank/payable | Proof, classification and approval. Many free-text labels are not reliable accounting categories. |
| REVERSAL | Dr prior credited accounts; Cr prior debited accounts | Link reversal to previously posted journal, no deleting history. |

## Observed ERP data shape
- Transaction columns: id, tx_ref, member_id, staff_id, park_id, loan_account_id, savings_account_id, tx_type, sub_type, direction, amount, channel, reversed_transaction_id, requires_approval, approved_at, business_date, posted_at, and supporting text.
- 124,945 operational rows observed, earliest business date 2026-04-09, latest 2026-11-14 at time of inspection.
- 61,287 repayments, 34,878 savings deposits, 14,779 remittances, 4,469 disbursements, 4,191 fees, 2,564 savings withdrawals, 2,308 expenses, 469 reversals.
- All 469 reversal rows contain a `reversed_transaction_id` (target existence not yet verified).
- Most collections are marked `CASH`; remittances are marked `BANK`. These reflect ERP channels, not independently confirmed bank/cash movement.
- Observed examples of expense sub_type requiring investigation: `SAVINGS WITHDRAWAL`, `CASH DISBURSEMENT`, `PREVIOUS DEFICIT`.
- Existing production GL has only 4 journal_entries and 6 journal_lines. **Never** backfill those tables as part of this branch.

## Accounting controls for production readiness
1. Classify source event and its debit/credit policy without posting anything yet.
2. Require daily park collection-to-remittance reconciliation and independent bank proof.
3. Split principal and interest by the actual repayment allocation engine; check charges separately.
4. Approve mapping with finance staff and test edge cases (split remittance, cash paid to relatives, reversals, duplicate disbursement).
5. Only then stage accounting_shadow objects on a genuinely separate test database, verify schema access policy and balance tests.
6. Keep public ERP and production Supabase untouched pending explicit sign-off.

The SQL under `02_read_only_classification_audit.sql` is a **read-only SELECT audit**. It reports policy candidates and exceptions, not bank-verified monetary balances.
