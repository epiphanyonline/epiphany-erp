-- STAGING ONLY. Requires 01_isolated_foundation.sql and 07_staging_financial_reports.sql.
-- Snapshot reporting reads the independent POSTED shadow ledger only.
-- No income should be invented from total loan repayments.
begin;
create or replace view accounting_shadow.balance_sheet_snapshot_daily as
with dates as (
 select distinct effective_date snapshot_date from accounting_shadow.posted_journal_detail
), balances as (
 select d.snapshot_date,j.account_kind,j.account_code,
        sum(j.debit-j.credit) net_debit
 from dates d
 join accounting_shadow.posted_journal_detail j on j.effective_date<=d.snapshot_date
 group by 1,2,3
)
select snapshot_date,
 sum(net_debit) filter(where account_kind='ASSET')::numeric(20,2) assets_net,
 (-sum(net_debit) filter(where account_kind='LIABILITY'))::numeric(20,2) liabilities,
 (-sum(net_debit) filter(where account_kind='EQUITY'))::numeric(20,2) contributed_and_retained_equity,
 (-sum(net_debit) filter(where account_kind='INCOME'))::numeric(20,2) cumulative_income,
 sum(net_debit) filter(where account_kind='EXPENSE')::numeric(20,2) cumulative_expenses
from balances
group by snapshot_date;
comment on view accounting_shadow.balance_sheet_snapshot_daily is
 'Provisional daily balance sheet from shadow postings. Requires approved opening balances. Profit is separate; not independently audited.';
-- Ledger control: posted events that fail zero-sum after manual DB modifications are detectable.
create or replace view accounting_shadow.journal_integrity_exceptions as
select e.id event_id,e.source_type,e.source_id,e.event_kind,
       count(l.id) line_count,
       coalesce(sum(l.debit),0)::numeric(20,2) debits,
       coalesce(sum(l.credit),0)::numeric(20,2) credits
from accounting_shadow.events e
left join accounting_shadow.lines l on l.event_id=e.id
where e.status='POSTED'
group by e.id
having count(l.id)<2 or coalesce(sum(l.debit),0)<>coalesce(sum(l.credit),0);
-- Note: balance-sheet design is not an approved official report.
commit;