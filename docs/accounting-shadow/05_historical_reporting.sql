-- READ ONLY: monthly operational activity. This is NOT a P&L: repayments contain principal.
select date_trunc('month',t.business_date)::date month_start,
 p.code park_code,p.name park_name,count(*) transaction_count,
 coalesce(sum(t.amount) filter(where t.tx_type='LOAN_DISBURSEMENT'),0) disbursements,
 coalesce(sum(t.amount) filter(where t.tx_type='LOAN_REPAYMENT'),0) repayments_gross,
 coalesce(sum(t.amount) filter(where t.tx_type='SAVINGS_DEPOSIT'),0) savings_deposits,
 coalesce(sum(t.amount) filter(where t.tx_type='SAVINGS_WITHDRAWAL'),0) savings_withdrawals,
 coalesce(sum(t.amount) filter(where t.tx_type='FEE'),0) fees_gross,
 coalesce(sum(t.amount) filter(where t.tx_type='REMITTANCE'),0) remittances_gross,
 coalesce(sum(t.amount) filter(where t.tx_type='EXPENSE'),0) expenses_unclassified,
 coalesce(sum(t.amount) filter(where t.tx_type='REVERSAL'),0) reversals_gross,
 count(*) filter(where t.tx_type='REVERSAL') reversals_count
from public.transactions t left join public.parks p on p.id=t.park_id
where t.business_date >= date '2026-04-01'
group by 1,2,3 order by 1,3;

-- READ ONLY: disbursement schedule vs ERP operational posting.
-- Neither approved nor posted status establishes actual settlement in the bank.
select l.business_date,l.line_ref,l.member_code,l.member_name_snapshot,l.park_name_snapshot,
 l.status,l.approved_amount,l.posted,l.posted_tx_ref,
 case
 when l.posted is true and l.posted_tx_ref is null then 'POSTED_WITHOUT_TX_REF'
 when l.posted is true and tx.id is null then 'POSTED_TX_REF_NOT_FOUND'
 when l.posted is true and tx.tx_type <> 'LOAN_DISBURSEMENT' then 'WRONG_TRANSACTION_TYPE'
 when l.posted is true and l.approved_amount is not null and tx.amount <> l.approved_amount then 'AMOUNT_MISMATCH'
 when l.posted is false and l.posted_tx_ref is not null then 'TX_REF_BUT_NOT_POSTED'
 else 'NO_SCHEDULE_LINK_EXCEPTION' end schedule_exception
from public.disbursement_schedule_lines l
left join public.transactions tx on tx.tx_ref=l.posted_tx_ref
where l.business_date >= date '2026-04-01';