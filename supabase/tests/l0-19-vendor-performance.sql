-- L0-19: vendor issues (LABCBH shape) opened, resolved and cancelled through the database functions with their role rules,
-- and none of it touches the stock ledger. The full evaluation workflow is covered by l0-22.
do $$
declare
  v_admin uuid;
  v_staff uuid := '19000000-0000-0000-0000-000000000002';
  v_vendor uuid;
  v_issue uuid;
  v_other uuid;
  v_transactions bigint;
  v_ok boolean;
begin
  select id into v_admin from public.nipt_users order by id limit 1;
  if v_admin is null then raise exception 'L0 vendor performance requires a seeded actor'; end if;
  insert into public.nipt_users(id, ephis_id, display_name, role, is_active) values (v_staff, 'L0-19-STAFF', 'L0-19 staff', 'CBH-Staff', true) on conflict (id) do nothing;
  insert into public.bm_user_access(user_id, role, is_active) values (v_staff, 'Staff', true) on conflict (user_id) do update set role = 'Staff', is_active = true;

  select public.create_bm_vendor(v_admin, '{"code":"L0-VENDOR-PERF","name":"L0 vendor performance fixture"}'::jsonb) into v_vendor;
  select count(*) into v_transactions from public.bm_stock_transactions;

  -- Staff open issues; only an Admin resolves or cancels them.
  v_issue := public.open_bm_vendor_issue(v_staff, v_vendor, 'complaint', 'L0 complaint fixture');
  v_other := public.open_bm_vendor_issue(v_staff, v_vendor, 'documentation_discrepancy', 'L0 documentation fixture');

  v_ok := false;
  begin perform public.resolve_bm_vendor_issue(v_staff, v_issue, 'vendor_warned', 'x'); exception when others then v_ok := sqlerrm like '%BM_ACCESS_DENIED%'; end;
  if not v_ok then raise exception 'L0-19 staff resolved an issue'; end if;
  v_ok := false;
  begin perform public.resolve_bm_vendor_issue(v_admin, v_issue, 'vendor_warned', ' '); exception when others then v_ok := sqlerrm like '%BM_ISSUE_RESOLUTION_REQUIRED%'; end;
  if not v_ok then raise exception 'L0-19 resolution without a note was accepted'; end if;

  perform public.resolve_bm_vendor_issue(v_admin, v_issue, 'vendor_replaced_goods', 'L0 resolved');
  if (select count(*) from public.bm_vendor_issues where vendor_id = v_vendor and resolution_status = 'resolved' and resolution_action = 'vendor_replaced_goods') <> 1 then
    raise exception 'L0 vendor issue resolution was not persisted';
  end if;
  v_ok := false;
  begin perform public.resolve_bm_vendor_issue(v_admin, v_issue, 'vendor_warned', 'again'); exception when others then v_ok := sqlerrm like '%BM_ISSUE_NOT_OPEN%'; end;
  if not v_ok then raise exception 'L0-19 a resolved issue was resolved twice'; end if;

  perform public.cancel_bm_vendor_issue(v_admin, v_other, 'opened_in_error', null);
  if (select resolution_status from public.bm_vendor_issues where id = v_other) <> 'cancelled' then raise exception 'L0-19 cancel was not persisted'; end if;

  -- The state constraint holds even for a direct write (cancelled without its stamp).
  v_ok := false;
  begin update public.bm_vendor_issues set resolution_status = 'cancelled' where id = v_issue; exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'L0-19 direct write bypassed the issue state constraint'; end if;

  if (select count(*) from public.bm_stock_transactions) <> v_transactions then
    raise exception 'L0 vendor evidence changed the stock ledger';
  end if;

  raise notice 'L0 VENDOR PERFORMANCE PASS: issue lifecycle, role rules, state constraint and ledger isolation verified.';
end $$;
