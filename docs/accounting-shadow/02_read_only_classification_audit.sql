-- EPIPHANY ERP — READ-ONLY accounting classification audit
-- This script MUST NOT write to any database tables or install any functions.
-- Run in a SQL read-only session against the Epiphany ERP project.
-- It does not establish a bookable GL balance or assert bank payment occurred.
-- April 2026 review starts at 2026-04-01, though the live record set begins later.
with source_tx as (
 select t.id,t.tx_ref,t.business_date,t.tx_type,t.sub_type,t.channel,t.direction,
        t.amount,t.park_id,t.member_id,t.loan_account_id,t.savings_account_id,
        t.reversed_transaction_id,t.reference_text,t.approved_at,
        t.requires_approval
 from public.transactions t
 where t.business_date >= date '2026-04-01'
),
classified as (
 select t.*,
 case
   when t.tx_type='REVERSAL' and t.reversed_transaction_id is null then 'MISSING_REVERSAL_TARGET'
   when t.tx_type='REVERSAL' then 'REVIEW_REVERSAL_SOURCE_AND_ORIGINAL'
   when t.requires_approval is true and t.approved_at is null then 'UNAPPROVED_TRANSACTION'
   when t.tx_type='LOAN_DISBURSEMENT' and t.loan_account_id is null then 'MISSING_LOAN_LINK'
   when t.tx_type='LOAN_DISBURSEMENT' then 'AWAIT_PAYMENT_EVIDENCE'
   when t.tx_type='LOAN_REPAYMENT' and t.loan_account_id is null then 'MISSING_LOAN_LINK'
   when t.tx_type='LOAN_REPAYMENT' then 'NEED_PRINCIPAL_INTEREST_ALLOCATION'
   when t.tx_type='SAVINGS_DEPOSIT' and t.savings_account_id is null then 'MISSING_SAVINGS_LINK'
   when t.tx_type='SAVINGS_WITHDRAWAL' and t.savings_account_id is null then 'MISSING_SAVINGS_LINK'
   when t.tx_type in ('SAVINGS_DEPOSIT','SAVINGS_WITHDRAWAL')
       and t.sub_type not in ('REGULAR','COMPULSORY') then 'UNKNOWN_SAVINGS_CLASS'
   when t.tx_type in ('SAVINGS_DEPOSIT','SAVINGS_WITHDRAWAL') then 'AWAIT_CASH_OR_BANK_CONFIRMATION'
   when t.tx_type='REMITTANCE' and t.sub_type not in ('GTB','FIRSTBANK','STERLING') then 'UNKNOWN_REMITTANCE_BANK'
   when t.tx_type='REMITTANCE' then 'AWAIT_BANK_STATEMENT_MATCH'
   when t.tx_type='FEE' and t.sub_type not in ('PROCESSING_FEE','MEMBERSHIP_FEE','CARD_FEE') then 'UNKNOWN_FEE_CLASS'
   when t.tx_type='FEE' then 'AWAIT_FEE_RECEIPT_EVIDENCE'
   when t.tx_type='EXPENSE' and (
     upper(coalesce(t.sub_type,'')) like '%SAVINGS%'
     or upper(coalesce(t.sub_type,'')) like '%DISBURSEMENT%'
     or upper(coalesce(t.sub_type,'')) like '%DEFICIT%'
     or upper(coalesce(t.sub_type,'')) like '%COLLECTION%'
   ) then 'POSSIBLE_TRANSFER_MISCODED_AS_EXPENSE'
   when t.tx_type='EXPENSE' then 'NEED_EXPENSE_CLASSIFICATION_AND_RECEIPT'
   else 'UNMAPPED_TRANSACTION_TYPE'
 end as accounting_exception,
 case
   when t.tx_type='LOAN_DISBURSEMENT' then '1100 / 1000 or bank after payment proof'
   when t.tx_type='LOAN_REPAYMENT' then '1000 or 1020 / 1100 plus interest and fees after allocation'
   when t.tx_type='SAVINGS_DEPOSIT' and t.sub_type='REGULAR' then '1000 or 1020 / 2000'
   when t.tx_type='SAVINGS_DEPOSIT' and t.sub_type='COMPULSORY' then '1000 or 1020 / 2001'
   when t.tx_type='SAVINGS_WITHDRAWAL' and t.sub_type='REGULAR' then '2000 / 1000 or bank'
   when t.tx_type='SAVINGS_WITHDRAWAL' and t.sub_type='COMPULSORY' then '2001 / 1000 or bank'
   when t.tx_type='REMITTANCE' then 'bank / 1000 or 1020 after statement match'
   when t.tx_type='FEE' then '1000 or 1020 / appropriate fee income'
   when t.tx_type='EXPENSE' then 'approved expense or settlement liability / 1000, bank or payable'
   when t.tx_type='REVERSAL' then 'mirror original posted lines with opposite entries'
   else 'NO POSTING RULE'
 end as candidate_journal_policy
 from source_tx t
)
select tx_type,coalesce(sub_type,'(none)') sub_type,accounting_exception,
       candidate_journal_policy,count(*) as transactions,
       sum(amount) as gross_recorded_amount
from classified
group by tx_type,coalesce(sub_type,'(none)'),accounting_exception,candidate_journal_policy
order by transactions desc,tx_type,sub_type;

-- A separate query: reversal integrity (read-only, run separately)
-- select count(*) as reversals,
--        count(*) filter (where orig.id is null) as missing_original
-- from public.transactions r
-- left join public.transactions orig on orig.id=r.reversed_transaction_id
-- where r.tx_type='REVERSAL' and r.business_date>=date '2026-04-01';
