do $$
declare
  v_actor uuid;
  v_vendor uuid;
  v_evaluation uuid;
  v_state_revision integer;
  v_approval_count integer;
  v_transactions bigint;
begin
  select id into v_actor from public.nipt_users order by id limit 1;
  if v_actor is null then raise exception 'L0 vendor evaluation requires a seeded actor'; end if;

  insert into public.bm_vendors(code, name, created_by)
  values ('L0-VENDOR-EVAL', 'L0 vendor evaluation fixture', v_actor)
  on conflict (code) do update set name = excluded.name
  returning id into v_vendor;

  select count(*) into v_transactions from public.bm_stock_transactions;

  insert into public.bm_vendor_evaluations(
    vendor_id, fiscal_year, metrics_snapshot, judgment, significant_events_snapshot, created_by
  ) values (
    v_vendor, '2027', '{"metrics": {"completeDelivery": {"numerator": 1, "denominator": 1}}}'::jsonb,
    '{"summary": "L0 draft"}'::jsonb, '[]'::jsonb, v_actor
  )
  on conflict (vendor_id, fiscal_year) do update set
    metrics_snapshot = excluded.metrics_snapshot,
    judgment = excluded.judgment,
    significant_events_snapshot = excluded.significant_events_snapshot,
    result = null,
    result_label = null
  returning id into v_evaluation;

  insert into public.bm_vendor_eval_document_states(evaluation_id, revision, status)
  values (v_evaluation, 1, 'draft')
  on conflict (evaluation_id) do update set revision = 1, status = 'draft';

  insert into public.bm_vendor_eval_approvals(evaluation_id, revision, approval_role, approved_by, signer_name)
  values (v_evaluation, 1, 'evaluator', v_actor, 'L0 evaluator');

  update public.bm_vendor_evaluations set revision = 2, result = null, result_label = null where id = v_evaluation;
  update public.bm_vendor_eval_document_states set revision = 2, status = 'draft' where evaluation_id = v_evaluation;

  select revision into v_state_revision from public.bm_vendor_eval_document_states where evaluation_id = v_evaluation;
  select count(*) into v_approval_count from public.bm_vendor_eval_approvals where evaluation_id = v_evaluation and revision = 1;
  if v_state_revision <> 2 or v_approval_count <> 1 then
    raise exception 'L0 vendor evaluation revision did not preserve the prior approval audit row';
  end if;
  if (select result from public.bm_vendor_evaluations where id = v_evaluation) is not null then
    raise exception 'L0 vendor evaluation result was populated without approved policy';
  end if;
  if (select is_approved from public.bm_vendor_eval_policies order by version desc limit 1) then
    raise exception 'L0 vendor evaluation policy is unexpectedly approved';
  end if;
  if (select count(*) from public.bm_stock_transactions) <> v_transactions then
    raise exception 'L0 vendor evaluation changed the stock ledger';
  end if;

  raise notice 'L0 VENDOR EVALUATION PASS: empty policy, frozen draft fields, revision bump, prior approval audit, null result, and ledger isolation verified.';
end $$;
