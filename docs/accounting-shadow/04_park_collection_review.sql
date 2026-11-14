-- READ ONLY: operational park collections and remittances since April 2026
-- NOT a bank reconciliation or closing cash balance. No reversed sums netted automatically.
with daily as (
 select t.park_id,t.business_date,
 count(*) filter(where tx_type='LOAN_REPAYMENT') repayment_count,
 coalesce(sum(amount) filter(where tx_type='LOAN_REPAYMENT'),0) repayments,
 coalesce(sum(amount) filter(where tx_type='SAVINGS_DEPOSIT'),0) savings_deposits,
 coalesce(sum(amount) filter(where tx_type='FEE'),0) fees,
 coalesce(sum(amount) filter(where tx_type='SAVINGS_WITHDRAWAL'),0) savings_withdrawals,
 coalesce(sum(amount) filter(where tx_type='LOAN_DISBURSEMENT'),0) disbursements,
 coalesce(sum(amount) filter(where tx_type='EXPENSE'),0) expenses_unclassified,
 coalesce(sum(amount) filter(where tx_type='REMITTANCE'),0) remittances,
 coalesce(sum(amount) filter(where tx_type='REVERSAL'),0) reversals,
 count(*) filter(where tx_type='REVERSAL') reversals_count
 from public.transactions t
 where t.business_date >= date '2026-04-01'
 group by 1,2
)
select d.business_date,p.code park_code,p.name park_name,d.*,
       (d.repayments+d.savings_deposits+d.fees) gross_receipts_before_reversals,
       'OPERATIONAL_ONLY_NOT_CONFIRMED_BANK_OR_CASH_BALANCE' control_note
from daily d left join public.parks p on p.id=d.park_id
order by d.business_date,p.name;