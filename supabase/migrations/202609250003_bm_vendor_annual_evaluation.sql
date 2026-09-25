-- Vendor evaluation port from LABCBH-Stock, part 3: signer positions and signatures, annual evaluation revisions with
-- frozen snapshots, and the LABCBH scoring rules. One evaluation per vendor and fiscal year (Buddhist era).
-- Replaces the Stock1 evaluation tables, which never held any evaluation (guarded below).

-- ---------------------------------------------------------------------------
-- Retire the Stock1 evaluation scaffolding. Refuses to run if any of it holds real data.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.bm_vendor_evaluations)
     or exists (select 1 from public.bm_vendor_eval_document_states)
     or exists (select 1 from public.bm_vendor_eval_approvals)
     or exists (select 1 from public.bm_vendor_eval_approver_assignments)
     or exists (select 1 from public.bm_vendor_eval_policies where is_approved or weights <> '{}'::jsonb or score_formulas <> '{}'::jsonb or result_thresholds <> '{}'::jsonb)
     or exists (select 1 from public.bm_vendor_significant_events)
     or exists (select 1 from public.bm_receiving_cold_chain_mappings) then
    raise exception 'Stock1 vendor evaluation tables hold data; they are not dropped automatically. Review them before applying this migration.';
  end if;
end $$;

drop table if exists public.bm_vendor_eval_approvals;
drop table if exists public.bm_vendor_eval_document_states;
drop table if exists public.bm_vendor_eval_approver_assignments;
drop table if exists public.bm_vendor_evaluations;
drop table if exists public.bm_vendor_eval_policies;
drop table if exists public.bm_vendor_significant_events;
drop table if exists public.bm_receiving_cold_chain_mappings;

-- ---------------------------------------------------------------------------
-- Signers: position title and a drawn PNG signature per user. nipt_users belongs to a shared identity service,
-- so Stock-BM keeps these in its own table.
-- ---------------------------------------------------------------------------
create table if not exists public.bm_user_signers (
  user_id uuid primary key references public.nipt_users(id),
  position_title text check (position_title is null or length(btrim(position_title)) between 1 and 200),
  signature_png text check (signature_png is null or (signature_png ~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' and length(signature_png) <= 400000)),
  updated_at timestamptz not null default now()
);
alter table public.bm_user_signers enable row level security;
-- A signature is a personal credential: no read policy at all, only definer functions copy it into a finalized report.
revoke all on table public.bm_user_signers from public, anon, authenticated;
grant all on table public.bm_user_signers to service_role;

create or replace function public.set_bm_user_position(p_actor uuid, p_user uuid, p_position text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.assert_bm_stock_actor(p_actor);
  v_position text := nullif(btrim(coalesce(p_position, '')), '');
begin
  if p_user <> p_actor and v_role <> 'Admin' then raise exception 'BM_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.nipt_users where id = p_user) then raise exception 'BM_USER_NOT_FOUND'; end if;
  if v_position is not null and length(v_position) > 200 then raise exception 'BM_POSITION_INVALID'; end if;
  insert into public.bm_user_signers (user_id, position_title, updated_at) values (p_user, v_position, now())
  on conflict (user_id) do update set position_title = excluded.position_title, updated_at = now();
  perform public.bm_write_audit(p_actor, 'user.position.set', 'stock-user-signer', p_user, jsonb_build_object('position', v_position));
end;
$$;

create or replace function public.save_bm_user_signature(p_actor uuid, p_png text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_png is null or p_png !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' or length(p_png) > 400000 then raise exception 'BM_SIGNATURE_INVALID'; end if;
  -- It is copied into an official report, so it must really be a PNG (the PDF cannot embed anything else).
  begin
    if encode(substring(decode(substr(p_png, length('data:image/png;base64,') + 1), 'base64') from 1 for 8), 'hex') <> '89504e470d0a1a0a' then raise exception 'BM_SIGNATURE_INVALID'; end if;
  exception when others then
    raise exception 'BM_SIGNATURE_INVALID';
  end;
  insert into public.bm_user_signers (user_id, signature_png, updated_at) values (p_actor, p_png, now())
  on conflict (user_id) do update set signature_png = excluded.signature_png, updated_at = now();
  perform public.bm_write_audit(p_actor, 'user.signature.save', 'stock-user-signer', p_actor, '{}'::jsonb);
end;
$$;

create or replace function public.clear_bm_user_signature(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_bm_stock_actor(p_actor);
  update public.bm_user_signers set signature_png = null, updated_at = now() where user_id = p_actor;
end;
$$;

-- Candidates for the three signature slots: active users with a position. Only an Admin can list them.
create or replace function public.list_bm_evaluation_signers(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.display_name, 'position', s.position_title, 'hasSignature', s.signature_png is not null) order by u.display_name)
    from public.nipt_users u
    join public.bm_user_access a on a.user_id = u.id and a.is_active
    join public.bm_user_signers s on s.user_id = u.id
    where u.is_active and s.position_title is not null), '[]'::jsonb);
end;
$$;

create or replace function public.bm_signatory_snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
  v_ephis text;
  v_position text;
begin
  select u.display_name, u.ephis_id, s.position_title into v_name, v_ephis, v_position
  from public.nipt_users u
  join public.bm_user_access a on a.user_id = u.id and a.is_active
  left join public.bm_user_signers s on s.user_id = u.id
  where u.id = p_user and u.is_active;
  if not found then raise exception 'BM_SIGNER_INACTIVE'; end if;
  if v_position is null then raise exception 'BM_SIGNER_POSITION_REQUIRED'; end if;
  return jsonb_build_object('id', p_user, 'name', v_name, 'position', v_position, 'ephisId', v_ephis);
end;
$$;

-- ---------------------------------------------------------------------------
-- Annual evaluation tables
-- ---------------------------------------------------------------------------
create table if not exists public.bm_vendor_annual_evaluations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id),
  fiscal_year integer not null check (fiscal_year between 2500 and 3000),
  current_final_revision_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.nipt_users(id),
  unique (vendor_id, fiscal_year)
);

create table if not exists public.bm_vendor_annual_evaluation_revisions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.bm_vendor_annual_evaluations(id),
  revision_number integer not null check (revision_number > 0),
  supersedes_revision_id uuid references public.bm_vendor_annual_evaluation_revisions(id),
  policy_id uuid not null references public.bm_vendor_evaluation_policies(id),
  status text not null default 'draft' check (status in ('draft', 'final')),
  evidence_snapshot jsonb not null,
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{32}$'),
  frozen_snapshot jsonb,
  report_fiscal_year integer,
  report_sequence integer check (report_sequence > 0),
  report_number text unique,
  judgment_summary text, strengths text, risks_concerns text, recommendations text,
  evaluator_id uuid references public.nipt_users(id), evaluator_name_snapshot text, evaluator_position_snapshot text, evaluator_signature text,
  reviewer_id uuid references public.nipt_users(id), reviewer_name_snapshot text, reviewer_position_snapshot text, reviewer_signature text,
  approver_id uuid references public.nipt_users(id), approver_name_snapshot text, approver_position_snapshot text, approver_signature text,
  finalized_at timestamptz, finalized_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(), created_by uuid not null references public.nipt_users(id),
  updated_at timestamptz not null default now(), updated_by uuid references public.nipt_users(id),
  unique (evaluation_id, revision_number),
  unique (report_fiscal_year, report_sequence),
  constraint bm_annual_revision_state_check check (
    (status = 'draft' and frozen_snapshot is null and report_fiscal_year is null and report_sequence is null and report_number is null and finalized_at is null and finalized_by is null
      and evaluator_signature is null and reviewer_signature is null and approver_signature is null)
    or (status = 'final' and frozen_snapshot is not null and report_fiscal_year is not null and report_sequence is not null and report_number is not null and finalized_at is not null and finalized_by is not null
      and length(btrim(coalesce(judgment_summary, ''))) > 0 and length(btrim(coalesce(strengths, ''))) > 0 and length(btrim(coalesce(risks_concerns, ''))) > 0 and length(btrim(coalesce(recommendations, ''))) > 0
      and evaluator_id is not null and evaluator_name_snapshot is not null and evaluator_position_snapshot is not null and evaluator_signature like 'data:image/png;base64,%'
      and reviewer_id is not null and reviewer_name_snapshot is not null and reviewer_position_snapshot is not null and reviewer_signature like 'data:image/png;base64,%'
      and approver_id is not null and approver_name_snapshot is not null and approver_position_snapshot is not null and approver_signature like 'data:image/png;base64,%')
  )
);
create unique index if not exists bm_annual_revision_one_draft_key on public.bm_vendor_annual_evaluation_revisions (evaluation_id) where status = 'draft';
alter table public.bm_vendor_annual_evaluations
  add constraint bm_annual_evaluation_final_fk foreign key (current_final_revision_id) references public.bm_vendor_annual_evaluation_revisions(id);

alter table public.bm_vendor_annual_evaluations enable row level security;
alter table public.bm_vendor_annual_evaluation_revisions enable row level security;
create policy bm_vendor_annual_evaluations_active_read on public.bm_vendor_annual_evaluations
for select using (public.current_bm_role() is not null);
create policy bm_vendor_annual_evaluation_revisions_active_read on public.bm_vendor_annual_evaluation_revisions
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_vendor_annual_evaluations from public, anon, authenticated;
grant all on table public.bm_vendor_annual_evaluations to service_role;
revoke all on table public.bm_vendor_annual_evaluation_revisions from public, anon, authenticated;
grant all on table public.bm_vendor_annual_evaluation_revisions to service_role;

-- A finalized report is a record: it cannot be edited or deleted; a change is a new revision.
create or replace function public.bm_guard_annual_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'BM_ANNUAL_REVISION_IMMUTABLE' using errcode = '55000'; end if;
  if old.status = 'final' then raise exception 'BM_ANNUAL_REVISION_IMMUTABLE' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger bm_annual_revisions_guard before update or delete on public.bm_vendor_annual_evaluation_revisions
for each row execute function public.bm_guard_annual_revision();

-- ---------------------------------------------------------------------------
-- Evidence: receipts, assessments and issues of one vendor in one fiscal year.
-- ---------------------------------------------------------------------------
create or replace function public.bm_vendor_evaluation_events(p_vendor uuid, p_fy integer)
returns table (receipt_id uuid, event_number text, invoice_id uuid, invoice_number text, received_date date, required boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, e.event_number, i.id, i.invoice_no, r.received_date,
         r.received_date >= (select assessment_required_from from public.bm_vendor_evaluation_settings)
  from public.bm_receipts r
  left join public.bm_invoices i on i.id = r.invoice_id
  left join public.bm_receipt_event_numbers e on e.receipt_id = r.id
  where r.vendor_id = p_vendor and r.status = 'confirmed' and public.bm_fiscal_year_be(r.received_date) = p_fy
$$;

-- Non-cancelled issues of the vendor whose fiscal year is the year of their receipt (or of their opening when they have none).
create or replace function public.bm_vendor_evaluation_issues(p_vendor uuid, p_fy integer)
returns setof public.bm_vendor_issues
language sql
stable
security definer
set search_path = public
as $$
  select iss.* from public.bm_vendor_issues iss
  where iss.vendor_id = p_vendor and iss.resolution_status <> 'cancelled'
    and coalesce((select public.bm_fiscal_year_be(r.received_date) from public.bm_receipts r where r.id = iss.receipt_id),
                 public.bm_fiscal_year_be((iss.opened_at at time zone 'Asia/Bangkok')::date)) = p_fy
$$;

create or replace function public.bm_vendor_evaluation_live_snapshot(p_vendor uuid, p_fy integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := make_date(p_fy - 544, 10, 1);
  v_to date := make_date(p_fy - 543, 9, 30);
  v_required date;
  v_vendor jsonb;
  v_completed integer; v_pending integer; v_events integer;
  n_pack integer; n_doc integer; n_item integer; n_cold integer; d_cold integer; n_comp integer; d_comp integer;
  n_ship integer; d_ship integer; n_life integer; d_life integer; n_fix integer; d_fix integer; supplementary integer;
  v_criteria jsonb; v_issues jsonb; v_receipts jsonb; v_assessments jsonb;
  v_invoices integer; v_open integer; v_resolved integer;
begin
  select assessment_required_from into v_required from public.bm_vendor_evaluation_settings;
  select jsonb_build_object('id', id, 'vendorCode', code, 'name', name, 'legalName', legal_name, 'taxId', tax_id, 'taxBranchCode', tax_branch_code, 'address', address)
    into v_vendor from public.bm_vendors where id = p_vendor;
  if v_vendor is null then raise exception 'BM_VENDOR_NOT_FOUND'; end if;

  select count(*) into v_events from public.bm_vendor_evaluation_events(p_vendor, p_fy);
  select count(a.id) filter (where a.status = 'completed'), count(*) filter (where a.id is null or a.status <> 'completed') into v_completed, v_pending
    from public.bm_vendor_evaluation_events(p_vendor, p_fy) e left join public.bm_receipt_assessments a on a.receipt_id = e.receipt_id where e.required;
  select count(*) filter (where a.product_condition = 'normal'), count(*) filter (where a.documentation = 'complete'), count(*) filter (where a.item_correctness = 'correct'),
         count(*) filter (where a.cold_chain_applicable and a.cold_chain_condition = 'appropriate'), count(*) filter (where a.cold_chain_applicable),
         count(*) filter (where a.has_complaint is not true)
    into n_pack, n_doc, n_item, n_cold, d_cold, n_comp
    from public.bm_vendor_evaluation_events(p_vendor, p_fy) e join public.bm_receipt_assessments a on a.receipt_id = e.receipt_id and a.status = 'completed' where e.required;
  d_comp := v_completed;

  -- 1: invoice lines of invoices that reached an end state (received in full or closed short) in the fiscal year.
  select count(*) filter (where l.closure_state = 'complete'), count(*) into n_ship, d_ship
    from public.bm_invoices i join public.bm_invoice_lines l on l.invoice_id = i.id
   where i.vendor_id = p_vendor and i.status = 'closed' and i.closed_at is not null
     and public.bm_fiscal_year_be((i.closed_at at time zone 'Asia/Bangkok')::date) = p_fy and l.closure_state in ('complete', 'short_closed');
  -- 2: received lines with an expiry date that met the TOR remaining-shelf-life rule on the receipt date.
  select count(*) filter (where rl.tor_expiry_compliance = 'compliant'), count(*) into n_life, d_life
    from public.bm_vendor_evaluation_events(p_vendor, p_fy) e join public.bm_receipt_lines rl on rl.receipt_id = e.receipt_id
   where rl.expiry_date is not null and rl.tor_expiry_compliance <> 'not_applicable';

  select count(*) filter (where resolution_status = 'resolved'), count(*), count(*) filter (where resolution_status = 'open'), count(*) filter (where resolution_status = 'resolved'),
         count(*) filter (where source_kind = 'manual' and issue_type in ('complaint', 'other'))
    into n_fix, d_fix, v_open, v_resolved, supplementary from public.bm_vendor_evaluation_issues(p_vendor, p_fy);
  select count(*) into v_invoices from public.bm_invoices i
   where i.vendor_id = p_vendor and public.bm_fiscal_year_be(coalesce(i.invoice_date, (i.created_at at time zone 'Asia/Bangkok')::date)) = p_fy and i.status <> 'cancelled';

  v_criteria := jsonb_build_array(
    jsonb_build_object('criterionCode', 'delivery_completeness', 'displayOrder', 1, 'numerator', n_ship, 'denominator', d_ship),
    jsonb_build_object('criterionCode', 'shelf_life', 'displayOrder', 2, 'numerator', n_life, 'denominator', d_life),
    jsonb_build_object('criterionCode', 'product_packaging', 'displayOrder', 3, 'numerator', n_pack, 'denominator', v_completed),
    jsonb_build_object('criterionCode', 'documentation', 'displayOrder', 4, 'numerator', n_doc, 'denominator', v_completed),
    jsonb_build_object('criterionCode', 'item_correctness', 'displayOrder', 5, 'numerator', n_item, 'denominator', v_completed),
    jsonb_build_object('criterionCode', 'cold_chain', 'displayOrder', 6, 'numerator', n_cold, 'denominator', d_cold),
    jsonb_build_object('criterionCode', 'complaint_performance', 'displayOrder', 7, 'numerator', n_comp, 'denominator', d_comp, 'supplementaryCount', supplementary),
    jsonb_build_object('criterionCode', 'corrective_action', 'displayOrder', 8, 'numerator', n_fix, 'denominator', d_fix));
  select jsonb_agg(c || jsonb_build_object('applicable', (c ->> 'denominator')::integer > 0,
      'percentage', case when (c ->> 'denominator')::integer > 0 then round((c ->> 'numerator')::numeric * 100 / (c ->> 'denominator')::numeric, 2) end)
      order by (c ->> 'displayOrder')::integer) into v_criteria from jsonb_array_elements(v_criteria) c;

  select coalesce(jsonb_agg(jsonb_build_object('id', iss.id, 'issueType', iss.issue_type, 'sourceKind', iss.source_kind, 'status', iss.resolution_status, 'openedAt', iss.opened_at,
      'description', iss.description, 'resolutionAction', iss.resolution_action, 'resolutionNote', iss.resolution_note, 'resolvedAt', iss.resolved_at,
      'invoiceNumber', (select invoice_no from public.bm_invoices where id = iss.invoice_id), 'eventNumber', (select event_number from public.bm_receipt_event_numbers where receipt_id = iss.receipt_id))
      order by iss.opened_at, iss.id), '[]'::jsonb) into v_issues from public.bm_vendor_evaluation_issues(p_vendor, p_fy) iss;
  select coalesce(jsonb_agg(jsonb_build_object('eventNumber', e.event_number, 'receivedDate', e.received_date, 'invoiceNumber', e.invoice_number, 'poNumber', null,
      'assessmentState', case when not e.required then 'not_required' when a.status = 'completed' then 'completed' else 'pending' end) order by e.received_date, e.event_number), '[]'::jsonb)
    into v_receipts from public.bm_vendor_evaluation_events(p_vendor, p_fy) e left join public.bm_receipt_assessments a on a.receipt_id = e.receipt_id;
  select coalesce(jsonb_agg(jsonb_build_object('eventNumber', e.event_number, 'receivedDate', e.received_date, 'invoiceNumber', e.invoice_number,
      'productCondition', a.product_condition, 'documentation', a.documentation, 'itemCorrectness', a.item_correctness, 'coldChainApplicable', a.cold_chain_applicable,
      'coldChainCondition', a.cold_chain_condition, 'hasComplaint', coalesce(a.has_complaint, false), 'acceptanceDecision', a.acceptance_decision,
      'note', a.note, 'reasons', to_jsonb(a.reason_codes), 'otherReasonDetail', a.other_reason_detail) order by e.received_date, e.event_number), '[]'::jsonb)
    into v_assessments from public.bm_vendor_evaluation_events(p_vendor, p_fy) e join public.bm_receipt_assessments a on a.receipt_id = e.receipt_id and a.status = 'completed' where e.required;

  return jsonb_build_object('vendor', v_vendor, 'fiscalYear', p_fy,
    'coverage', jsonb_build_object('startDate', greatest(v_from, v_required), 'endDate', v_to, 'assessmentRequiredFrom', v_required, 'completed', v_completed, 'pending', v_pending,
      'percentage', case when v_completed + v_pending = 0 then null else round(v_completed * 100.0 / (v_completed + v_pending), 2) end),
    'activity', jsonb_build_object('invoices', v_invoices, 'receipts', v_events, 'completedAssessments', v_completed, 'pendingAssessments', v_pending, 'openIssues', v_open, 'resolvedIssues', v_resolved),
    'criteria', v_criteria, 'issues', v_issues, 'receipts', v_receipts, 'assessments', v_assessments, 'capturedAt', now());
end;
$$;

-- The hash ignores capturedAt only, so it changes exactly when the evidence changes.
create or replace function public.bm_evidence_hash(p_snapshot jsonb)
returns text
language sql
immutable
set search_path = public
as $$ select md5((p_snapshot - 'capturedAt')::text) $$;

-- Live performance for readers: the same evidence calculation the annual report freezes, without freezing anything.
create or replace function public.get_bm_vendor_performance(p_actor uuid, p_vendor uuid, p_fiscal_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_fiscal_year is null or p_fiscal_year not between 2500 and 3000 then raise exception 'BM_FISCAL_YEAR_INVALID'; end if;
  return public.bm_vendor_evaluation_live_snapshot(p_vendor, p_fiscal_year) - 'issues' - 'assessments';
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft, save, refresh, finalize (Admin only)
-- ---------------------------------------------------------------------------
create or replace function public.create_bm_vendor_annual_evaluation_draft(p_actor uuid, p_vendor uuid, p_fiscal_year integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval public.bm_vendor_annual_evaluations%rowtype;
  v_draft uuid;
  v_prev public.bm_vendor_annual_evaluation_revisions%rowtype;
  v_policy uuid; v_snapshot jsonb; v_rev integer; v_id uuid;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  if p_fiscal_year is null or p_fiscal_year not between 2500 and 3000 then raise exception 'BM_FISCAL_YEAR_INVALID'; end if;
  if not exists (select 1 from public.bm_vendors where id = p_vendor) then raise exception 'BM_VENDOR_NOT_FOUND'; end if;
  v_policy := public.bm_policy_for_fiscal_year(p_fiscal_year);
  if v_policy is null then raise exception 'BM_POLICY_NOT_FOUND'; end if;
  insert into public.bm_vendor_annual_evaluations (vendor_id, fiscal_year, created_by) values (p_vendor, p_fiscal_year, p_actor)
  on conflict (vendor_id, fiscal_year) do nothing;
  select * into v_eval from public.bm_vendor_annual_evaluations where vendor_id = p_vendor and fiscal_year = p_fiscal_year for update;
  select id into v_draft from public.bm_vendor_annual_evaluation_revisions where evaluation_id = v_eval.id and status = 'draft';
  if v_draft is not null then return v_draft; end if;
  v_snapshot := public.bm_vendor_evaluation_live_snapshot(p_vendor, p_fiscal_year);
  select coalesce(max(revision_number), 0) + 1 into v_rev from public.bm_vendor_annual_evaluation_revisions where evaluation_id = v_eval.id;
  if v_eval.current_final_revision_id is not null then select * into v_prev from public.bm_vendor_annual_evaluation_revisions where id = v_eval.current_final_revision_id; end if;
  insert into public.bm_vendor_annual_evaluation_revisions (evaluation_id, revision_number, supersedes_revision_id, policy_id, evidence_snapshot, evidence_hash,
      judgment_summary, strengths, risks_concerns, recommendations, evaluator_id, evaluator_name_snapshot, evaluator_position_snapshot, reviewer_id, reviewer_name_snapshot, reviewer_position_snapshot,
      approver_id, approver_name_snapshot, approver_position_snapshot, created_by, updated_by)
  values (v_eval.id, v_rev, v_prev.id, v_policy, v_snapshot, public.bm_evidence_hash(v_snapshot),
      v_prev.judgment_summary, v_prev.strengths, v_prev.risks_concerns, v_prev.recommendations, v_prev.evaluator_id, v_prev.evaluator_name_snapshot, v_prev.evaluator_position_snapshot,
      v_prev.reviewer_id, v_prev.reviewer_name_snapshot, v_prev.reviewer_position_snapshot, v_prev.approver_id, v_prev.approver_name_snapshot, v_prev.approver_position_snapshot, p_actor, p_actor)
  returning id into v_id;
  perform public.bm_write_audit(p_actor, 'vendor.annual.draft', 'stock-vendor-annual-evaluation', v_eval.id, jsonb_build_object('fiscalYear', p_fiscal_year, 'revision', v_rev));
  return v_id;
end;
$$;

create or replace function public.save_bm_vendor_annual_evaluation_draft(p_actor uuid, p_revision uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev public.bm_vendor_annual_evaluation_revisions%rowtype;
  e jsonb; r jsonb; a jsonb;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_rev from public.bm_vendor_annual_evaluation_revisions where id = p_revision for update;
  if not found then raise exception 'BM_ANNUAL_REVISION_NOT_FOUND'; end if;
  if v_rev.status <> 'draft' then raise exception 'BM_ANNUAL_REVISION_IMMUTABLE' using errcode = '55000'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or exists (select 1 from jsonb_object_keys(p_data) k where k not in ('summary','strengths','risksConcerns','recommendations','evaluatorId','reviewerId','approverId')) then
    raise exception 'BM_ANNUAL_INPUT_INVALID';
  end if;
  if length(coalesce(p_data ->> 'summary', '')) > 4000 or length(coalesce(p_data ->> 'strengths', '')) > 4000 or length(coalesce(p_data ->> 'risksConcerns', '')) > 4000 or length(coalesce(p_data ->> 'recommendations', '')) > 4000 then
    raise exception 'BM_ANNUAL_INPUT_INVALID';
  end if;
  e := case when nullif(p_data ->> 'evaluatorId', '') is null then null else public.bm_signatory_snapshot((p_data ->> 'evaluatorId')::uuid) end;
  r := case when nullif(p_data ->> 'reviewerId', '') is null then null else public.bm_signatory_snapshot((p_data ->> 'reviewerId')::uuid) end;
  a := case when nullif(p_data ->> 'approverId', '') is null then null else public.bm_signatory_snapshot((p_data ->> 'approverId')::uuid) end;
  update public.bm_vendor_annual_evaluation_revisions set
    judgment_summary = nullif(btrim(coalesce(p_data ->> 'summary', '')), ''), strengths = nullif(btrim(coalesce(p_data ->> 'strengths', '')), ''),
    risks_concerns = nullif(btrim(coalesce(p_data ->> 'risksConcerns', '')), ''), recommendations = nullif(btrim(coalesce(p_data ->> 'recommendations', '')), ''),
    evaluator_id = (e ->> 'id')::uuid, evaluator_name_snapshot = e ->> 'name', evaluator_position_snapshot = e ->> 'position',
    reviewer_id = (r ->> 'id')::uuid, reviewer_name_snapshot = r ->> 'name', reviewer_position_snapshot = r ->> 'position',
    approver_id = (a ->> 'id')::uuid, approver_name_snapshot = a ->> 'name', approver_position_snapshot = a ->> 'position',
    updated_at = now(), updated_by = p_actor
  where id = p_revision;
end;
$$;

create or replace function public.refresh_bm_vendor_annual_evaluation_draft(p_actor uuid, p_revision uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev public.bm_vendor_annual_evaluation_revisions%rowtype;
  v_eval public.bm_vendor_annual_evaluations%rowtype;
  v_snapshot jsonb;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_rev from public.bm_vendor_annual_evaluation_revisions where id = p_revision for update;
  if not found then raise exception 'BM_ANNUAL_REVISION_NOT_FOUND'; end if;
  if v_rev.status <> 'draft' then raise exception 'BM_ANNUAL_REVISION_IMMUTABLE' using errcode = '55000'; end if;
  select * into v_eval from public.bm_vendor_annual_evaluations where id = v_rev.evaluation_id;
  v_snapshot := public.bm_vendor_evaluation_live_snapshot(v_eval.vendor_id, v_eval.fiscal_year);
  -- Refreshing also moves the draft to the policy that applies now, so a draft opened while the policy was only a proposal is not stuck.
  update public.bm_vendor_annual_evaluation_revisions set evidence_snapshot = v_snapshot, evidence_hash = public.bm_evidence_hash(v_snapshot),
    policy_id = coalesce(public.bm_policy_for_fiscal_year(v_eval.fiscal_year), policy_id), updated_at = now(), updated_by = p_actor where id = p_revision;
end;
$$;

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
  if v_coverage is not null and v_coverage < v_policy.minimum_coverage_percent then raise exception 'BM_ANNUAL_COVERAGE_LOW'; end if;

  if v_rev.judgment_summary is null or v_rev.strengths is null or v_rev.risks_concerns is null or v_rev.recommendations is null then raise exception 'BM_ANNUAL_TEXT_REQUIRED'; end if;
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
      'judgment', jsonb_build_object('summary', v_rev.judgment_summary, 'strengths', v_rev.strengths, 'risksConcerns', v_rev.risks_concerns, 'recommendations', v_rev.recommendations),
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

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'set_bm_user_position(uuid,uuid,text)', 'save_bm_user_signature(uuid,text)', 'clear_bm_user_signature(uuid)', 'list_bm_evaluation_signers(uuid)',
    'bm_signatory_snapshot(uuid)', 'bm_guard_annual_revision()', 'bm_vendor_evaluation_events(uuid,integer)', 'bm_vendor_evaluation_issues(uuid,integer)',
    'bm_vendor_evaluation_live_snapshot(uuid,integer)', 'bm_evidence_hash(jsonb)', 'get_bm_vendor_performance(uuid,uuid,integer)',
    'create_bm_vendor_annual_evaluation_draft(uuid,uuid,integer)', 'save_bm_vendor_annual_evaluation_draft(uuid,uuid,jsonb)',
    'refresh_bm_vendor_annual_evaluation_draft(uuid,uuid)', 'finalize_bm_vendor_annual_evaluation(uuid,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
