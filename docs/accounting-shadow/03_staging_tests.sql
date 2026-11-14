-- STAGING-ONLY validation of accounting_shadow. NEVER run on production.
-- Requires 01_isolated_foundation.sql applied to a separate sandbox database.
-- Transaction always rolls back, so no test accounting records persist.
begin;
do $$
declare
 v_id uuid;
 v_source uuid := gen_random_uuid();
 v_duplicate_blocked boolean := false;
 v_unbalanced_blocked boolean := false;
 v_wrong_precision_blocked boolean := false;
 v_count int;
 v_debit numeric;
 v_credit numeric;
begin
 v_id := accounting_shadow.post_reviewed_event(
   'TEST_FIXTURE',v_source,'SAVINGS_DEPOSIT',date '2026-11-14',
   'Synthetic test — not a real client',
   '[{"code":"1000","debit":1000.00},{"code":"2000","credit":1000.00}]'::jsonb
 );
 select count(*),sum(l.debit),sum(l.credit) into v_count,v_debit,v_credit
 from accounting_shadow.lines l where l.event_id=v_id;
 if v_count<>2 or v_debit<>1000 or v_credit<>1000 then
   raise exception 'Balanced-posting test failed';
 end if;

 begin
   perform accounting_shadow.post_reviewed_event(
     'TEST_FIXTURE',v_source,'SAVINGS_DEPOSIT',date '2026-11-14',
     'Repeated event',
     '[{"code":"1000","debit":1000},{"code":"2000","credit":1000}]'::jsonb
   );
 exception when others then
   v_duplicate_blocked := true;
 end;
 if not v_duplicate_blocked then raise exception 'Duplicate-posting guard failed'; end if;

 begin
   perform accounting_shadow.post_reviewed_event(
     'TEST_FIXTURE',gen_random_uuid(),'UNBALANCED',date '2026-11-14',
     'Unbalanced fixture',
     '[{"code":"1000","debit":1000},{"code":"2000","credit":900}]'::jsonb
   );
 exception when others then
   v_unbalanced_blocked := true;
 end;
 if not v_unbalanced_blocked then raise exception 'Unbalanced guard failed'; end if;

 begin
   perform accounting_shadow.post_reviewed_event(
     'TEST_FIXTURE',gen_random_uuid(),'FRACTIONAL',date '2026-11-14',
     'Fractional kobo fixture',
     '[{"code":"1000","debit":100.001},{"code":"2000","credit":100.001}]'::jsonb
   );
 exception when others then
   v_wrong_precision_blocked := true;
 end;
 if not v_wrong_precision_blocked then raise exception 'Currency precision guard failed'; end if;

 if (select debit_total from accounting_shadow.trial_balance where code='1000') < 1000 then
   raise exception 'Trial balance cash balance missing';
 end if;
 raise notice 'PASS: balanced entry, duplicate guard, unbalanced guard, precision guard, trial balance';
end;
$$;
rollback;

-- Separate reviewer security checks (staging only):
-- select has_schema_privilege('anon','accounting_shadow','USAGE') as anon_can_use_schema;
-- select has_schema_privilege('authenticated','accounting_shadow','USAGE') as staff_api_can_use_schema;
-- Both should be false.
