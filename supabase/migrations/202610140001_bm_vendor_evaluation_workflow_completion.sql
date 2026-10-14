-- Forward-only completion of Vendor Evaluation V1.
-- Approved policies and existing frozen reports are preserved.
create or replace function public.finalize_bm_vendor_annual_evaluation(p_actor uuid, p_revision uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev public.bm_vendor_annual_evaluation_revisions%rowtype;
  v_eval public.bm_vendor_annual_evaluations%rowtype;
  v_policy public.bm_vendor_evaluation_policies%rowtype;
  v_live jsonb; v_coverage numeric;
  v_sig_e text; v_sig_r text; v_sig_a text;
  v_applicable_weight numeric; v_score numeric; v_seq integer; v_number text;
  v_criteria jsonb; v_signers jsonb;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_rev from public.bm_vendor_annual_evaluation_revisions where id = p_revision for update;
  if not found then raise exception 'BM_ANNUAL_REVISION_NOT_FOUND'; end if;
  if v_rev.status <> 'draft' then raise exception 'BM_ANNUAL_REVISION_IMMUTABLE' using errcode = '55000'; end if;
  select * into v_eval from public.bm_vendor_annual_evaluations where id = v_rev.evaluation_id for update;
  select * into v_policy from public.bm_vendor_evaluation_policies where id = v_rev.policy_id for share;
  if v_policy.status <> 'approved' then raise exception 'BM_POLICY_NOT_APPROVED'; end if;

  v_live := public.bm_vendor_evaluation_live_snapshot(v_eval.vendor_id, v_eval.fiscal_year);
  if public.bm_evidence_hash(v_live) <> v_rev.evidence_hash then raise exception 'BM_ANNUAL_EVIDENCE_STALE'; end if;
  v_coverage := nullif(v_live #>> '{coverage,percentage}', '')::numeric;
  if v_coverage is null or v_coverage < v_policy.minimum_coverage_percent then raise exception 'BM_ANNUAL_COVERAGE_LOW'; end if;

  -- The four narrative fields are optional; an empty value is printable as a dash in the PDF.
  if v_rev.evaluator_id is null or v_rev.reviewer_id is null or v_rev.approver_id is null then raise exception 'BM_ANNUAL_SIGNERS_REQUIRED'; end if;
  -- Names and positions are re-read now, so the report shows what they are at signing time; signatures are copied from each signer's own record.
  v_signers := jsonb_build_object('evaluator', public.bm_signatory_snapshot(v_rev.evaluator_id), 'reviewer', public.bm_signatory_snapshot(v_rev.reviewer_id), 'approver', public.bm_signatory_snapshot(v_rev.approver_id));
  select signature_png into v_sig_e from public.bm_user_signers where user_id = v_rev.evaluator_id;
  select signature_png into v_sig_r from public.bm_user_signers where user_id = v_rev.reviewer_id;
  select signature_png into v_sig_a from public.bm_user_signers where user_id = v_rev.approver_id;
  if v_sig_e is null or v_sig_r is null or v_sig_a is null then raise exception 'BM_ANNUAL_SIGNATURE_MISSING'; end if;

  -- Score: weighted share of the criteria that have data; a criterion with no denominator drops out and its weight is spread over the rest.
  select sum(c.weight) into v_applicable_weight
    from public.bm_vendor_evaluation_policy_criteria c join jsonb_array_elements(v_live -> 'criteria') s on s ->> 'criterionCode' = c.criterion_code
   where c.policy_id = v_policy.id and (s ->> 'denominator')::integer > 0;
  if v_applicable_weight is null or v_applicable_weight <= 0 then raise exception 'BM_ANNUAL_NO_APPLICABLE_CRITERIA'; end if;
  select jsonb_agg(jsonb_build_object('criterionCode', c.criterion_code, 'label', c.label, 'displayOrder', c.display_order, 'numerator', (s ->> 'numerator')::integer, 'denominator', (s ->> 'denominator')::integer,
      'applicable', (s ->> 'denominator')::integer > 0, 'percentage', s -> 'percentage', 'weight', c.weight,
      'effectiveWeight', case when (s ->> 'denominator')::integer > 0 then round(c.weight * 100 / v_applicable_weight, 2) end,
      'weightedScore', case when (s ->> 'denominator')::integer > 0 then round((s ->> 'numerator')::numeric / (s ->> 'denominator')::numeric * c.weight / v_applicable_weight * 100, 2) end,
      'supplementaryCount', s -> 'supplementaryCount', 'evidenceDefinition', c.evidence_definition, 'calculationDefinition', c.calculation_definition, 'naDefinition', c.na_definition) order by c.display_order),
    round(sum(case when (s ->> 'denominator')::integer > 0 then (s ->> 'numerator')::numeric / (s ->> 'denominator')::numeric * c.weight / v_applicable_weight * 100 else 0 end), 2)
    into v_criteria, v_score
    from public.bm_vendor_evaluation_policy_criteria c join jsonb_array_elements(v_live -> 'criteria') s on s ->> 'criterionCode' = c.criterion_code where c.policy_id = v_policy.id;

  perform pg_advisory_xact_lock(86421, v_eval.fiscal_year);
  select coalesce(max(report_sequence), 0) + 1 into v_seq from public.bm_vendor_annual_evaluation_revisions where report_fiscal_year = v_eval.fiscal_year;
  v_number := 'VE-' || v_eval.fiscal_year || '-' || lpad(v_seq::text, 4, '0');

  update public.bm_vendor_annual_evaluation_revisions set
    status = 'final', evidence_snapshot = v_live,
    frozen_snapshot = jsonb_build_object('evidence', v_live, 'criteria', v_criteria, 'score', v_score, 'result', case when v_score >= v_policy.pass_threshold then 'pass' else 'fail' end,
      'policy', jsonb_build_object('id', v_policy.id, 'version', v_policy.version, 'passThreshold', v_policy.pass_threshold, 'minimumCoveragePercent', v_policy.minimum_coverage_percent,
        'approvedAt', v_policy.approved_at, 'approvedByName', v_policy.approved_by_name_snapshot),
      'judgment', jsonb_build_object('summary', coalesce(v_rev.judgment_summary, ''), 'strengths', coalesce(v_rev.strengths, ''), 'risksConcerns', coalesce(v_rev.risks_concerns, ''), 'recommendations', coalesce(v_rev.recommendations, '')),
      'signatories', v_signers, 'reportNumber', v_number, 'revision', v_rev.revision_number, 'finalizedAt', now()),
    report_fiscal_year = v_eval.fiscal_year, report_sequence = v_seq, report_number = v_number,
    evaluator_name_snapshot = v_signers -> 'evaluator' ->> 'name', evaluator_position_snapshot = v_signers -> 'evaluator' ->> 'position', evaluator_signature = v_sig_e,
    reviewer_name_snapshot = v_signers -> 'reviewer' ->> 'name', reviewer_position_snapshot = v_signers -> 'reviewer' ->> 'position', reviewer_signature = v_sig_r,
    approver_name_snapshot = v_signers -> 'approver' ->> 'name', approver_position_snapshot = v_signers -> 'approver' ->> 'position', approver_signature = v_sig_a,
    finalized_at = now(), finalized_by = p_actor, updated_at = now(), updated_by = p_actor
  where id = p_revision;
  update public.bm_vendor_annual_evaluations set current_final_revision_id = p_revision where id = v_eval.id;
  perform public.bm_write_audit(p_actor, 'vendor.annual.finalize', 'stock-vendor-annual-evaluation', v_eval.id, jsonb_build_object('reportNumber', v_number, 'score', v_score));
  return v_number;
end;
$$;


-- FOLLOW-UP REGISTER. A failed annual report creates exactly one task per immutable revision.
-- No existing final revision, stock receipt, ledger, vendor issue or policy is modified.
create table if not exists public.bm_vendor_annual_followups (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references public.bm_vendor_annual_evaluation_revisions(id),
  vendor_id uuid not null references public.bm_vendors(id),
  fiscal_year integer not null check (fiscal_year between 2500 and 3000),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  responsible_user_id uuid references public.nipt_users(id),
  due_date date,
  action_plan text check (action_plan is null or length(action_plan) <= 4000),
  resolution_note text check (resolution_note is null or length(resolution_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.nipt_users(id),
  closed_at timestamptz,
  closed_by uuid references public.nipt_users(id),
  constraint bm_vendor_followup_progress_fields check (
    status = 'open' or
    (responsible_user_id is not null and due_date is not null and nullif(btrim(coalesce(action_plan,'')), '') is not null)
  ),
  constraint bm_vendor_followup_close_fields check (
    (status <> 'closed' and closed_at is null and closed_by is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and nullif(btrim(coalesce(resolution_note,'')), '') is not null)
  )
);
create index if not exists bm_vendor_followups_vendor_status_idx
  on public.bm_vendor_annual_followups(vendor_id,status,created_at desc);
alter table public.bm_vendor_annual_followups enable row level security;
create policy bm_vendor_annual_followups_active_read on public.bm_vendor_annual_followups
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_vendor_annual_followups from public, anon, authenticated;
grant all on table public.bm_vendor_annual_followups to service_role;

create or replace function public.bm_create_vendor_annual_fail_followup()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_vendor uuid; v_fy integer;
begin
  if new.status = 'final' and (tg_op = 'INSERT' or old.status is distinct from 'final')
     and new.frozen_snapshot ->> 'result' = 'fail' then
    select vendor_id, fiscal_year into v_vendor, v_fy
      from public.bm_vendor_annual_evaluations where id = new.evaluation_id;
    insert into public.bm_vendor_annual_followups (revision_id,vendor_id,fiscal_year)
      values (new.id,v_vendor,v_fy) on conflict (revision_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists bm_vendor_annual_fail_followup on public.bm_vendor_annual_evaluation_revisions;
create trigger bm_vendor_annual_fail_followup
after insert or update of status on public.bm_vendor_annual_evaluation_revisions
for each row execute function public.bm_create_vendor_annual_fail_followup();

-- Safe, idempotent coverage for final failed reports that may already exist.
insert into public.bm_vendor_annual_followups (revision_id,vendor_id,fiscal_year)
select r.id, e.vendor_id, e.fiscal_year
from public.bm_vendor_annual_evaluation_revisions r
join public.bm_vendor_annual_evaluations e on e.id = r.evaluation_id
where r.status = 'final' and r.frozen_snapshot ->> 'result' = 'fail'
on conflict (revision_id) do nothing;

create or replace function public.update_bm_vendor_annual_followup(
  p_actor uuid, p_vendor uuid, p_followup uuid, p_status text,
  p_owner uuid, p_due date, p_plan text, p_resolution text,
  p_expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare v_followup public.bm_vendor_annual_followups%rowtype;
  v_plan text := nullif(btrim(coalesce(p_plan, '')), '');
  v_note text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  perform public.bm_require_role(p_actor,array['Admin']);
  select * into v_followup from public.bm_vendor_annual_followups
    where id = p_followup and vendor_id = p_vendor for update;
  if not found then raise exception 'BM_VENDOR_FOLLOWUP_NOT_FOUND'; end if;
  if v_followup.updated_at is distinct from p_expected_updated_at then raise exception 'BM_STALE_DATA'; end if;
  if p_status is null or p_status not in ('open','in_progress','closed')
     or length(coalesce(p_plan,'')) > 4000 or length(coalesce(p_resolution,'')) > 4000 then
    raise exception 'BM_VENDOR_FOLLOWUP_INVALID';
  end if;
  if p_owner is not null and not exists (
    select 1 from public.bm_user_access a join public.nipt_users u on u.id = a.user_id
    where a.user_id = p_owner and a.is_active and a.role in ('Admin','Staff') and u.is_active
  ) then raise exception 'BM_VENDOR_FOLLOWUP_OWNER_INVALID'; end if;
  if p_status <> 'open' and (p_owner is null or p_due is null or v_plan is null) then
    raise exception 'BM_VENDOR_FOLLOWUP_PLAN_REQUIRED';
  end if;
  if p_status = 'closed' and v_note is null then raise exception 'BM_VENDOR_FOLLOWUP_RESOLUTION_REQUIRED'; end if;
  update public.bm_vendor_annual_followups
  set status=p_status, responsible_user_id=p_owner, due_date=p_due, action_plan=v_plan,
      resolution_note=case when p_status='closed' then v_note else null end,
      closed_at=case when p_status='closed' then now() else null end,
      closed_by=case when p_status='closed' then p_actor else null end,
      updated_at=clock_timestamp(), updated_by=p_actor
  where id = p_followup;
  perform public.bm_write_audit(p_actor,'vendor.annual.followup.update','stock-vendor-annual-followup',p_followup,
    jsonb_build_object('vendorId',p_vendor,'from',v_followup.status,'to',p_status,'responsibleUserId',p_owner,'dueDate',p_due));
end;
$$;

revoke all on function public.bm_create_vendor_annual_fail_followup() from public, anon, authenticated;
grant execute on function public.bm_create_vendor_annual_fail_followup() to service_role;
revoke all on function public.update_bm_vendor_annual_followup(uuid,uuid,uuid,text,uuid,date,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.update_bm_vendor_annual_followup(uuid,uuid,uuid,text,uuid,date,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
