-- Epiphany ERP: isolated accounting foundation (STAGING ONLY)
-- DO NOT place under supabase/migrations until formally approved for deployment.
-- This file creates NEW objects only, in a non-exposed schema.
-- It does not alter public.transactions, loan_accounts, existing journal tables,
-- application auth, staff screens, profit reports, or repayment logic.
begin;
create schema if not exists accounting_shadow;
revoke all on schema accounting_shadow from public, anon, authenticated;
comment on schema accounting_shadow is 'Independent accounting staging ledger. No production event hooks.';
create table if not exists accounting_shadow.accounts (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists accounting_shadow.events (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'EPIPHANY_ERP',
  source_type text not null,
  source_id uuid not null,
  event_kind text not null,
  effective_date date not null,
  memo text,
  status text not null default 'DRAFT' check(status in ('DRAFT','POSTED')),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique(source_system,source_type,source_id,event_kind),
  check ((status='DRAFT' and posted_at is null) or (status='POSTED' and posted_at is not null))
);
create table if not exists accounting_shadow.lines (
  id bigint generated always as identity primary key,
  event_id uuid not null references accounting_shadow.events(id) on delete restrict,
  account_id bigint not null references accounting_shadow.accounts(id),
  debit numeric(20,2) not null default 0 check(debit >= 0),
  credit numeric(20,2) not null default 0 check(credit >= 0),
  park_id uuid,
  member_id uuid,
  loan_account_id uuid,
  note text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists shadow_lines_event_idx on accounting_shadow.lines(event_id);
create index if not exists shadow_events_effective_date_idx on accounting_shadow.events(effective_date);
create table if not exists accounting_shadow.exceptions (
  id bigint generated always as identity primary key,
  source_type text not null,
  source_id uuid,
  exception_code text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check(status in ('OPEN','REVIEWED','RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(source_type,source_id,exception_code)
);
-- This chart extends existing codes logically but is deliberately independent.
insert into accounting_shadow.accounts(code,name,kind) values
 ('1000','Cash in Hand','ASSET'),
 ('1010','GTBank','ASSET'),
 ('1011','FirstBank','ASSET'),
 ('1012','Sterling Bank','ASSET'),
 ('1020','Collections Clearing','ASSET'),
 ('1030','Unidentified Bank Receipts Clearing','ASSET'),
 ('1100','Loan Principal Receivable','ASSET'),
 ('1110','Accrued Interest Receivable','ASSET'),
 ('1190','Allowance for Expected Credit Losses','ASSET'),
 ('2000','Client Regular Savings','LIABILITY'),
 ('2001','Client Compulsory Savings','LIABILITY'),
 ('2100','Accounts Payable','LIABILITY'),
 ('2110','Staff Payables','LIABILITY'),
 ('2190','Unallocated Receipts Liability','LIABILITY'),
 ('3000','Owner Capital','EQUITY'),
 ('3100','Retained Earnings','EQUITY'),
 ('3200','Owner Drawings','EQUITY'),
 ('4000','Processing Fee Income','INCOME'),
 ('4010','Membership Fee Income','INCOME'),
 ('4020','Card Fee Income','INCOME'),
 ('4100','Interest Income','INCOME'),
 ('4200','Other Operating Income','INCOME'),
 ('5000','Staff Salaries','EXPENSE'),
 ('5010','Rent','EXPENSE'),
 ('5020','Transport','EXPENSE'),
 ('5030','Office Operations','EXPENSE'),
 ('5040','Bank Charges','EXPENSE'),
 ('5050','Utilities','EXPENSE'),
 ('5060','Technology and Subscriptions','EXPENSE'),
 ('5070','Repairs and Maintenance','EXPENSE'),
 ('5900','Credit Impairment Expense','EXPENSE')
on conflict(code) do nothing;

-- Atomic, idempotent post. Explicit journal lines ONLY after a reviewed classification.
-- No triggers from existing tables and no automatic inference of interest.
create or replace function accounting_shadow.post_reviewed_event(
 p_source_type text, p_source_id uuid, p_event_kind text,
 p_effective_date date, p_memo text, p_lines jsonb
) returns uuid
language plpgsql set search_path = pg_catalog, accounting_shadow
as $$
declare
 v_id uuid;
 v_count integer;
 v_debits numeric(20,2);
 v_credits numeric(20,2);
begin
 if p_source_type is null or length(trim(p_source_type))=0 or p_source_id is null
    or p_event_kind is null or length(trim(p_event_kind))=0 or p_effective_date is null then
   raise exception 'Source identity and effective date required';
 end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)<2 then
   raise exception 'At least two lines required';
 end if;
 -- Prevent negative, zero, mixed debit/credit, missing account and rounding drift.
 select count(*),sum(coalesce((j->>'debit')::numeric,0)),sum(coalesce((j->>'credit')::numeric,0))
 into v_count,v_debits,v_credits from jsonb_array_elements(p_lines) j
 where (coalesce((j->>'debit')::numeric,0)>0 and coalesce((j->>'credit')::numeric,0)=0)
    or (coalesce((j->>'credit')::numeric,0)>0 and coalesce((j->>'debit')::numeric,0)=0);
 if v_count <> jsonb_array_length(p_lines) or v_debits is null or v_debits <= 0
    or v_debits <> v_credits then
   raise exception 'Invalid or unbalanced posting';
 end if;
 if exists(select 1 from jsonb_array_elements(p_lines) j
   where (coalesce((j->>'debit')::numeric,0)*100) <> trunc(coalesce((j->>'debit')::numeric,0)*100)
      or (coalesce((j->>'credit')::numeric,0)*100) <> trunc(coalesce((j->>'credit')::numeric,0)*100)
      or not exists(select 1 from accounting_shadow.accounts a where a.code=j->>'code' and a.active))
 then raise exception 'Unknown account or invalid decimal precision'; end if;

 insert into accounting_shadow.events(source_type,source_id,event_kind,effective_date,memo,status,posted_at)
 values(p_source_type,p_source_id,p_event_kind,p_effective_date,p_memo,'POSTED',now())
 on conflict(source_system,source_type,source_id,event_kind) do nothing
 returning id into v_id;
 if v_id is null then
   raise exception 'Event already recorded: %/%/%',p_source_type,p_source_id,p_event_kind;
 end if;
 insert into accounting_shadow.lines(event_id,account_id,debit,credit,park_id,member_id,loan_account_id,note)
 select v_id,a.id,coalesce((j->>'debit')::numeric,0),coalesce((j->>'credit')::numeric,0),
        nullif(j->>'park_id','')::uuid,nullif(j->>'member_id','')::uuid,
        nullif(j->>'loan_account_id','')::uuid,j->>'note'
 from jsonb_array_elements(p_lines) j
 join accounting_shadow.accounts a on a.code=j->>'code' and a.active;
 if (select count(*) from accounting_shadow.lines where event_id=v_id)<>jsonb_array_length(p_lines)
 then raise exception 'Unmapped account'; end if;
 return v_id;
end;
$$;
revoke all on function accounting_shadow.post_reviewed_event(text,uuid,text,date,text,jsonb) from public,anon,authenticated;
create or replace view accounting_shadow.trial_balance as
select a.code,a.name,a.kind,
       coalesce(sum(l.debit),0)::numeric(20,2) debit_total,
       coalesce(sum(l.credit),0)::numeric(20,2) credit_total,
       coalesce(sum(l.debit-l.credit),0)::numeric(20,2) net_debit
from accounting_shadow.accounts a
left join accounting_shadow.lines l on a.id=l.account_id
  and exists (select 1 from accounting_shadow.events e where e.id=l.event_id and e.status='POSTED')
group by a.code,a.name,a.kind;
-- Objects remain private: no roles granted access, no job or trigger installed.
commit;
