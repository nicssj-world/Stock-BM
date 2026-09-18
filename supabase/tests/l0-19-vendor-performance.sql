do $$
declare
  v_actor uuid;
  v_vendor uuid;
  v_issue uuid;
  v_transactions bigint;
  v_rows integer;
begin
  select id into v_actor from public.nipt_users order by id limit 1;
  if v_actor is null then raise exception 'L0 vendor performance requires a seeded actor'; end if;

  insert into public.bm_vendors(code, name, created_by)
  values ('L0-VENDOR-PERF', 'L0 vendor performance fixture', v_actor)
  on conflict (code) do update set name = excluded.name
  returning id into v_vendor;

  select count(*) into v_transactions from public.bm_stock_transactions;

  insert into public.bm_vendor_issues(
    vendor_id, issue_type, description, opened_by, opened_at
  ) values (
    v_vendor, 'complaint', 'L0 complaint fixture', v_actor, '2026-09-18T01:00:00Z'
  ) returning id into v_issue;

  insert into public.bm_vendor_issues(
    vendor_id, issue_type, description, opened_by, opened_at
  ) values (
    v_vendor, 'documentation_discrepancy', 'L0 documentation fixture', v_actor, '2026-09-18T02:00:00Z'
  );

  update public.bm_vendor_issues
  set resolution_status = 'resolved', resolution_note = 'L0 resolved', resolved_by = v_actor, resolved_at = now()
  where id = v_issue;

  insert into public.bm_vendor_significant_events(
    vendor_id, event_type, severity, event_date, description, issue_id, created_by
  ) values (
    v_vendor, 'quality_review', 'significant', '2026-09-18', 'L0 significant event fixture', v_issue, v_actor
  );

  select count(*) into v_rows
  from public.bm_vendor_issues
  where vendor_id = v_vendor and resolution_status = 'resolved';
  if v_rows <> 1 then raise exception 'L0 vendor issue resolution was not persisted'; end if;

  if (select count(*) from public.bm_receiving_cold_chain_mappings where is_approved) <> 0 then
    raise exception 'L0 P-12 mapping unexpectedly contains an approved row';
  end if;

  if (select count(*) from public.bm_stock_transactions) <> v_transactions then
    raise exception 'L0 vendor evidence changed the stock ledger';
  end if;

  raise notice 'L0 VENDOR PERFORMANCE PASS: issues, resolution, events, empty P-12 mapping, and ledger isolation verified.';
end $$;
