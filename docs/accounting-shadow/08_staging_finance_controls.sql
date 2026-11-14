-- STAGING ONLY. Apply after 01_isolated_foundation.sql in a separate database.
-- Finance operating controls; does not connect to or modify existing ERP.
begin;
create table if not exists accounting_shadow.accounting_periods(
  id bigint generated always as identity primary key,
  period_start date not null unique,
  period_end date not null,
  status text not null default 'OPEN' check(status in ('OPEN','REVIEW','CLOSED')),
  closed_at timestamptz,
  closed_by text,
  check (period_end >= period_start),
  check ((status='CLOSED' and closed_at is not null and closed_by is not null)
      or (status <> 'CLOSED' and closed_at is null))
);
create table if not exists accounting_shadow.source_mappings(
  id bigint generated always as identity primary key,
  source_type text not null,
  sub_type text not null default '',
  rule_code text not null,
  recognition_basis text not null check(recognition_basis in ('CASH','ACCRUAL','TRANSFER','MANUAL_REVIEW')),
  status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','SUSPENDED')),
  approved_by text,
  approved_at timestamptz,
  unique(source_type,sub_type,rule_code),
  check(status <> 'APPROVED' or (approved_by is not null and approved_at is not null))
);
create table if not exists accounting_shadow.opening_balances(
  id bigint generated always as identity primary key,
  cutoff_date date not null,
  account_id bigint not null references accounting_shadow.accounts(id),
  park_id uuid,
  amount_debit numeric(20,2) not null default 0 check(amount_debit>=0),
  amount_credit numeric(20,2) not null default 0 check(amount_credit>=0),
  evidence_reference text,
  status text not null default 'DRAFT' check(status in ('DRAFT','REVIEWED','APPROVED')),
  reviewed_by text,approved_by text,
  note text,
  check((amount_debit>0 and amount_credit=0) or (amount_credit>0 and amount_debit=0)),
  check(status<>'APPROVED' or (approved_by is not null and evidence_reference is not null))
);
create index if not exists opening_balances_cutoff_idx on accounting_shadow.opening_balances(cutoff_date);
create table if not exists accounting_shadow.adjustment_requests(
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  effective_date date not null,
  reason text not null,
  supporting_document_ref text,
  proposed_lines jsonb not null check(jsonb_typeof(proposed_lines)='array'),
  status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED')),
  requested_by text not null,
  approved_by text,
  approved_at timestamptz,
  posted_event_id uuid unique references accounting_shadow.events(id),
  created_at timestamptz not null default now(),
  check(status not in ('APPROVED','POSTED') or (approved_by is not null and approved_at is not null)),
  check(status<>'POSTED' or posted_event_id is not null)
);
create table if not exists accounting_shadow.reconciliation_runs(
  id uuid primary key default gen_random_uuid(),
  bank_code text not null,
  period_start date not null,
  period_end date not null,
  statement_opening numeric(20,2),
  statement_closing numeric(20,2),
  statement_file_checksum text,
  prepared_by text not null,
  reviewed_by text,
  status text not null default 'DRAFT' check(status in ('DRAFT','IN_REVIEW','SIGNED_OFF')),
  prepared_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notes text,
  check(period_end>=period_start),
  check(status<>'SIGNED_OFF' or (reviewed_by is not null and reviewed_at is not null and statement_closing is not null))
);
create table if not exists accounting_shadow.bank_statement_lines(
  id uuid primary key default gen_random_uuid(),
  reconciliation_run_id uuid not null references accounting_shadow.reconciliation_runs(id),
  line_no integer not null check(line_no>0),
  value_date date not null,
  narration text,
  reference text,
  debit numeric(20,2) not null default 0 check(debit>=0),
  credit numeric(20,2) not null default 0 check(credit>=0),
  unique(reconciliation_run_id,line_no),
  check((debit>0 and credit=0) or (credit>0 and debit=0))
);
create table if not exists accounting_shadow.reconciliation_matches(
  id uuid primary key default gen_random_uuid(),
  reconciliation_run_id uuid not null references accounting_shadow.reconciliation_runs(id),
  bank_line_id uuid not null references accounting_shadow.bank_statement_lines(id),
  source_type text not null,
  source_id uuid not null,
  matched_amount numeric(20,2) not null check(matched_amount>0),
  match_basis text not null,
  status text not null default 'SUGGESTED' check(status in ('SUGGESTED','CONFIRMED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  unique(bank_line_id,source_type,source_id),
  check(status<>'CONFIRMED' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists recon_matches_source_idx on accounting_shadow.reconciliation_matches(source_type,source_id);
create or replace view accounting_shadow.reconciliation_weekly_summary as
select r.id run_id,r.bank_code,r.period_start,r.period_end,r.status,
       r.statement_opening,r.statement_closing,
       count(distinct s.id) statement_lines,
       coalesce(sum(s.credit),0)::numeric(20,2) bank_credits,
       coalesce(sum(s.debit),0)::numeric(20,2) bank_debits,
       (r.statement_opening + coalesce(sum(s.credit),0)-coalesce(sum(s.debit),0)-r.statement_closing)::numeric(20,2) statement_variance
from accounting_shadow.reconciliation_runs r
left join accounting_shadow.bank_statement_lines s on s.reconciliation_run_id=r.id
group by r.id;
-- Deliberately no auto-matching/auto-posting and no public grants.
commit;