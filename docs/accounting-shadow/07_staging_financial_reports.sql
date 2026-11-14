-- STAGING ONLY. Apply AFTER 01_isolated_foundation.sql on a separate test database.
-- These are views over the independent shadow ledger, not live ERP tables.
begin;
create or replace view accounting_shadow.posted_journal_detail as
select e.id event_id,e.effective_date,e.source_type,e.source_id,e.event_kind,
       e.memo,e.posted_at,l.id line_id,l.park_id,l.member_id,l.loan_account_id,
       a.code account_code,a.name account_name,a.kind account_kind,
       l.debit,l.credit,l.note
from accounting_shadow.events e
join accounting_shadow.lines l on l.event_id=e.id
join accounting_shadow.accounts a on a.id=l.account_id
where e.status='POSTED';

create or replace view accounting_shadow.monthly_profit_loss as
select date_trunc('month',effective_date)::date period_start,
       park_id,
       sum(case when account_kind='INCOME' then credit-debit else 0 end)::numeric(20,2) income,
       sum(case when account_kind='EXPENSE' then debit-credit else 0 end)::numeric(20,2) expenses,
       sum(case when account_kind='INCOME' then credit-debit
                when account_kind='EXPENSE' then credit-debit else 0 end)::numeric(20,2) net_profit
from accounting_shadow.posted_journal_detail
where account_kind in ('INCOME','EXPENSE')
group by 1,2;

-- As-of balances by account, including contra-asset accounts.
-- Net is debit positive; statements must interpret signs according to account type.
create or replace view accounting_shadow.account_balances_by_day as
select effective_date, account_code, account_name, account_kind, park_id,
       sum(debit)::numeric(20,2) debit_for_day,
       sum(credit)::numeric(20,2) credit_for_day,
       sum(debit-credit)::numeric(20,2) net_debit_for_day
from accounting_shadow.posted_journal_detail
group by 1,2,3,4,5;

create or replace view accounting_shadow.park_cash_movement as
select effective_date,park_id,
       sum(case when account_code in ('1000','1020') then debit else 0 end)::numeric(20,2) cash_in,
       sum(case when account_code in ('1000','1020') then credit else 0 end)::numeric(20,2) cash_out,
       sum(case when account_code in ('1000','1020') then debit-credit else 0 end)::numeric(20,2) net_cash_movement
from accounting_shadow.posted_journal_detail
group by 1,2;

-- Operational balance is NOT confirmed physical cash or a statement balance.
comment on view accounting_shadow.park_cash_movement is
 'Posted shadow-ledger cash movements, not a certified cash count or bank reconciliation.';
commit;
