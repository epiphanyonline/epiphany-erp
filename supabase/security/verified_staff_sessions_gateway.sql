-- Epiphany ERP: staged secure session gateway.
-- REVIEW: This file is not a standalone cutover: the old public RPC grants
-- and public table writes MUST be revoked in the coordinated release once
-- preview validation and staff logins are confirmed.
-- Never store staff PINs or raw sessions in this repository.
--
-- Precondition: epiphany_internal.staff_sessions and
-- public.epiphany_issue_staff_session, epiphany_staff_session_info,
-- epiphany_revoke_staff_session have been installed and tested.
--
-- This gateway is a SECURITY DEFINER function intentionally exposed to anon.
-- It enforces an opaque token, current staff role, and actor-code binding.
-- It invokes only approved RPCs and preserves each RPC's existing business
-- rules (including maker/checker schedule submission and approval).

CREATE OR REPLACE FUNCTION public.epiphany_secure_financial_action(
  p_session_token text,
  p_action text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,epiphany_internal AS $$
DECLARE
  v_staff record;
  v_actor text;
  v_allowed text[];
  v_proc record;
  v_args text;
  v_function_sql text;
  v_result jsonb;
  v_arg_name text;
  v_arg_type text;
  v_arg_count integer;
BEGIN
  IF length(coalesce(p_session_token,'')) <> 64
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR length(p_payload::text)>200000 THEN
    RAISE EXCEPTION 'Invalid financial session or request'
      USING ERRCODE='28000';
  END IF;

  SELECT * INTO v_staff
  FROM public.epiphany_staff_session_info(p_session_token) LIMIT 1;
  IF v_staff.staff_id IS NULL OR NOT v_staff.is_active THEN
    RAISE EXCEPTION 'Financial session expired; please sign in again'
      USING ERRCODE='28000';
  END IF;

  -- Makers can initiate and maintain schedules. Approval and posting are
  -- separate rights. Only current database roles (not browser role strings)
  -- determine permission.
  IF upper(v_staff.role) IN ('ADMIN','SUPERVISOR') THEN
    v_allowed := ARRAY[
      'post_loan_repayment','post_loan_disbursement',
      'post_savings_deposit','post_savings_withdrawal',
      'post_expense','post_cash_remittance','post_fee',
      'reverse_posted_transaction','close_staff_day',
      'approve_expense_and_post_accounting',
      'create_disbursement_schedule_batch','update_disbursement_schedule_line',
      'add_disbursement_schedule_line','remove_disbursement_schedule_line',
      'submit_disbursement_schedule_batch','delete_disbursement_schedule_batch',
      'approve_disbursement_schedule_line','decline_disbursement_schedule_line',
      'bulk_post_loan_upload','register_bulk_upload_member',
      'retry_bulk_upload_row','resolve_bulk_upload_exception',
      'ignore_bulk_upload_exception','bulk_register_members_upload',
      'register_bulk_membership_row','admin_supervisor_update_member_details',
      'delete_duplicate_member'
    ];
  ELSIF upper(v_staff.role) IN ('OFFICER','SUPPORT_OFFICER','SUPPORT OFFICER') THEN
    v_allowed := ARRAY[
      'post_loan_repayment','post_savings_deposit','post_expense',
      'post_cash_remittance','post_fee',
      'create_disbursement_schedule_batch','update_disbursement_schedule_line',
      'add_disbursement_schedule_line','remove_disbursement_schedule_line',
      'submit_disbursement_schedule_batch','delete_disbursement_schedule_batch'
    ];
  ELSE
    v_allowed := ARRAY[]::text[];
  END IF;

  IF NOT (p_action=ANY(v_allowed)) THEN
    RAISE EXCEPTION 'This staff role is not authorised for the requested action'
      USING ERRCODE='42501';
  END IF;

  -- Determine who the operation claims to be: callers cannot supply
  -- the staff_code of a different employee or approver.
  IF p_action='approve_expense_and_post_accounting' THEN
    IF (p_payload->>'p_approved_by')::uuid IS DISTINCT FROM v_staff.staff_id THEN
      RAISE EXCEPTION 'Approver does not match verified session'
        USING ERRCODE='42501';
    END IF;
  ELSIF p_action='close_staff_day' THEN
    v_actor := p_payload->>'p_closed_by_staff_code';
  ELSE
    v_actor := coalesce(
      p_payload->>'p_requesting_staff_code',
      p_payload->>'p_supervisor_staff_code',
      p_payload->>'p_staff_code'
    );
  END IF;

  IF p_action<>'approve_expense_and_post_accounting'
      AND btrim(coalesce(v_actor,'')) IS DISTINCT FROM v_staff.staff_code THEN
    RAISE EXCEPTION 'Staff code does not match verified session'
      USING ERRCODE='42501';
  END IF;

  -- No arbitrary SQL or RPC names can be supplied by a caller.
  -- Pick the existing overload only when its input argument names
  -- exactly match the supplied JSON object. SQL identifiers/types
  -- come exclusively from pg_catalog, never from unquoted caller strings.
  SELECT p.oid, p.proretset, p.pronargs, p.proargnames,
     p.proargtypes, p.prorettype
  INTO v_proc
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=p_action
    AND p.pronargs=(SELECT count(*) FROM jsonb_object_keys(p_payload))
    AND NOT EXISTS(
      SELECT 1 FROM jsonb_object_keys(p_payload) AS input_key
      WHERE NOT (input_key = ANY(p.proargnames[1:p.pronargs]))
    )
    AND NOT EXISTS(
      SELECT 1 FROM unnest(p.proargnames[1:p.pronargs]) AS required_name
      WHERE NOT p_payload ? required_name
    )
  LIMIT 1;

  IF v_proc.oid IS NULL THEN
    RAISE EXCEPTION 'Request parameter names are invalid for this operation'
      USING ERRCODE='22023';
  END IF;

  v_args := '';
  FOR v_arg_count IN 0..(v_proc.pronargs-1) LOOP
    v_arg_name := v_proc.proargnames[v_arg_count+1];
    v_arg_type := pg_catalog.format_type(v_proc.proargtypes[v_arg_count],NULL);
    IF v_arg_count>0 THEN v_args:=v_args||','; END IF;
    v_args:=v_args||format('($1->>%L)::%s',v_arg_name,v_arg_type);
  END LOOP;

  v_function_sql := format(
    'SELECT %s FROM public.%I(%s) AS x',
    CASE WHEN v_proc.proretset
      THEN 'coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb)'
      ELSE 'to_jsonb(x)' END,
    p_action,v_args
  );
  EXECUTE v_function_sql INTO v_result USING p_payload;
  RETURN v_result;
END
$$;

REVOKE ALL ON FUNCTION public.epiphany_secure_financial_action(text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.epiphany_secure_financial_action(text,text,jsonb)
  TO anon,authenticated;

-- Pre-cutover tests (do not run actual financial postings):
-- 1. Missing/invalid session token must fail with SQLSTATE 28000.
-- 2. Valid officer session can invoke maker actions without modifying a loan.
-- 3. Officer session must reject approve_disbursement_schedule_line.
-- 4. Supervisor session can approve; mismatched actor codes must fail.
-- 5. Existing public direct transaction INSERT/loan UPDATE must be revoked
--    at cutover, alongside the old financial RPC EXECUTE grants.
-- 6. No production promotion until all tests pass.
