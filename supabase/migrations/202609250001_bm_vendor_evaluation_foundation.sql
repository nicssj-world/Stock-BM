-- Vendor evaluation port from LABCBH-Stock, part 1: vendor master, closing an invoice short, receipt event numbers,
-- LABCBH receipt-assessment rules (reasons, revisions) and LABCBH-style vendor issues.
-- Nothing here touches the stock ledger, balances, lots or the receive RPCs. Receiving stays dark-launched
-- (bm_receiving_policies.is_enabled is not changed).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Thai Buddhist-era fiscal year (1 Oct - 30 Sep): 2026-10-01 -> 2570.
create or replace function public.bm_fiscal_year_be(p_date date)
returns integer
language sql
immutable
set search_path = public
as $$
  select extract(year from p_date)::integer + 543 + case when extract(month from p_date) >= 10 then 1 else 0 end
$$;

create or replace function public.bm_require_role(p_actor uuid, p_roles text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.assert_bm_stock_actor(p_actor);
begin
  if not (v_role = any(p_roles)) then raise exception 'BM_ACCESS_DENIED'; end if;
  return v_role;
end;
$$;

create or replace function public.bm_write_audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id uuid, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
  values (p_actor, p_action, p_entity_type, p_entity_id, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.bm_text(p_data jsonb, p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(coalesce(p_data ->> p_key, '')), '')
$$;

-- ---------------------------------------------------------------------------
-- Vendor master (LABCBH vendors table)
-- ---------------------------------------------------------------------------
alter table public.bm_vendors
  add column if not exists legal_name text,
  add column if not exists tax_branch_code text not null default '00000',
  add column if not exists updated_by uuid references public.nipt_users(id);

-- Existing rows may predate these rules, so the checks are NOT VALID: they bind every new or changed row.
alter table public.bm_vendors
  add constraint bm_vendors_tax_id_format check (tax_id is null or tax_id ~ '^[0-9]{13}$') not valid,
  add constraint bm_vendors_tax_branch_format check (tax_branch_code ~ '^[0-9]{5}$'),
  add constraint bm_vendors_email_format check (email is null or email like '%@%') not valid;

do $$
begin
  if exists (select 1 from public.bm_vendors group by lower(btrim(name)) having count(*) > 1) then
    raise notice 'bm_vendors: duplicate vendor names exist, unique-name index skipped; resolve them and create bm_vendors_name_ci_key';
  else
    create unique index if not exists bm_vendors_name_ci_key on public.bm_vendors (lower(btrim(name)));
  end if;
  if exists (select 1 from public.bm_vendors where tax_id is not null group by tax_id, tax_branch_code having count(*) > 1) then
    raise notice 'bm_vendors: duplicate tax ids exist, unique-tax index skipped; resolve them and create bm_vendors_tax_key';
  else
    create unique index if not exists bm_vendors_tax_key on public.bm_vendors (tax_id, tax_branch_code) where tax_id is not null;
  end if;
end $$;

create or replace function public.bm_assert_vendor_fields(p_data jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'BM_VENDOR_FIELD_INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where k not in ('code','name','legalName','taxId','taxBranchCode','address','contactPerson','phone','email','note')) then
    raise exception 'BM_VENDOR_FIELD_INVALID';
  end if;
end;
$$;

create or replace function public.bm_assert_vendor_unique(p_id uuid, p_code text, p_name text, p_tax_id text, p_branch text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.bm_vendors v where upper(btrim(v.code)) = upper(p_code) and v.id is distinct from p_id) then raise exception 'BM_VENDOR_CODE_TAKEN'; end if;
  if exists (select 1 from public.bm_vendors v where lower(btrim(v.name)) = lower(p_name) and v.id is distinct from p_id) then raise exception 'BM_VENDOR_NAME_TAKEN'; end if;
  if p_tax_id is not null and exists (select 1 from public.bm_vendors v where v.tax_id = p_tax_id and v.tax_branch_code = p_branch and v.id is distinct from p_id) then raise exception 'BM_VENDOR_TAX_TAKEN'; end if;
end;
$$;

create or replace function public.create_bm_vendor(p_actor uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
  v_tax text;
  v_branch text;
  v_id uuid;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  perform public.bm_assert_vendor_fields(p_data);
  v_code := upper(public.bm_text(p_data, 'code'));
  v_name := public.bm_text(p_data, 'name');
  v_tax := public.bm_text(p_data, 'taxId');
  v_branch := coalesce(public.bm_text(p_data, 'taxBranchCode'), '00000');
  if v_code is null or v_name is null then raise exception 'BM_VENDOR_CODE_NAME_REQUIRED'; end if;
  perform public.bm_assert_vendor_unique(null, v_code, v_name, v_tax, v_branch);
  insert into public.bm_vendors (code, name, legal_name, tax_id, tax_branch_code, address, contact_person, phone, email, note, created_by, updated_by)
  values (v_code, v_name, public.bm_text(p_data, 'legalName'), v_tax, v_branch, public.bm_text(p_data, 'address'), public.bm_text(p_data, 'contactPerson'),
          public.bm_text(p_data, 'phone'), public.bm_text(p_data, 'email'), public.bm_text(p_data, 'note'), p_actor, p_actor)
  returning id into v_id;
  perform public.bm_write_audit(p_actor, 'vendor.create', 'stock-vendor', v_id, jsonb_build_object('code', v_code, 'name', v_name));
  return v_id;
end;
$$;

-- Partial patch like LABCBH update_vendor: a present key overwrites (blank clears), a missing key keeps the value.
create or replace function public.update_bm_vendor(p_actor uuid, p_id uuid, p_data jsonb, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.bm_vendors%rowtype;
  v_code text;
  v_name text;
  v_tax text;
  v_branch text;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  perform public.bm_assert_vendor_fields(p_data);
  select * into v_old from public.bm_vendors where id = p_id for update;
  if not found then raise exception 'BM_VENDOR_NOT_FOUND'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'BM_STALE_DATA'; end if;
  v_code := case when p_data ? 'code' then upper(public.bm_text(p_data, 'code')) else v_old.code end;
  v_name := case when p_data ? 'name' then public.bm_text(p_data, 'name') else v_old.name end;
  v_tax := case when p_data ? 'taxId' then public.bm_text(p_data, 'taxId') else v_old.tax_id end;
  v_branch := case when p_data ? 'taxBranchCode' then coalesce(public.bm_text(p_data, 'taxBranchCode'), '00000') else v_old.tax_branch_code end;
  if v_code is null or v_name is null then raise exception 'BM_VENDOR_CODE_NAME_REQUIRED'; end if;
  perform public.bm_assert_vendor_unique(p_id, v_code, v_name, v_tax, v_branch);
  update public.bm_vendors set
    code = v_code, name = v_name, tax_id = v_tax, tax_branch_code = v_branch,
    legal_name = case when p_data ? 'legalName' then public.bm_text(p_data, 'legalName') else legal_name end,
    address = case when p_data ? 'address' then public.bm_text(p_data, 'address') else address end,
    contact_person = case when p_data ? 'contactPerson' then public.bm_text(p_data, 'contactPerson') else contact_person end,
    phone = case when p_data ? 'phone' then public.bm_text(p_data, 'phone') else phone end,
    email = case when p_data ? 'email' then public.bm_text(p_data, 'email') else email end,
    note = case when p_data ? 'note' then public.bm_text(p_data, 'note') else note end,
    updated_at = clock_timestamp(), updated_by = p_actor
  where id = p_id;
  perform public.bm_write_audit(p_actor, 'vendor.update', 'stock-vendor', p_id, jsonb_build_object('before', to_jsonb(v_old), 'keys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
end;
$$;

create or replace function public.set_bm_vendor_active(p_actor uuid, p_id uuid, p_active boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  if p_active is null then raise exception 'BM_VENDOR_FIELD_INVALID'; end if;
  select is_active into v_current from public.bm_vendors where id = p_id for update;
  if not found then raise exception 'BM_VENDOR_NOT_FOUND'; end if;
  if v_current = p_active then return; end if;
  if not p_active and v_note is null then raise exception 'BM_REASON_REQUIRED'; end if;
  update public.bm_vendors set is_active = p_active, updated_at = clock_timestamp(), updated_by = p_actor where id = p_id;
  perform public.bm_write_audit(p_actor, case when p_active then 'vendor.activate' else 'vendor.deactivate' end, 'stock-vendor', p_id, jsonb_build_object('note', v_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Evaluation module settings: receipts confirmed before this date are "not required" for assessment/scoring.
-- ---------------------------------------------------------------------------
create table if not exists public.bm_vendor_evaluation_settings (
  singleton boolean primary key default true check (singleton),
  assessment_required_from date not null,
  created_at timestamptz not null default now()
);
insert into public.bm_vendor_evaluation_settings (assessment_required_from)
values ((now() at time zone 'Asia/Bangkok')::date)
on conflict (singleton) do nothing;
alter table public.bm_vendor_evaluation_settings enable row level security;
create policy bm_vendor_evaluation_settings_active_read on public.bm_vendor_evaluation_settings
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_vendor_evaluation_settings from public, anon, authenticated;
grant all on table public.bm_vendor_evaluation_settings to service_role;

-- ---------------------------------------------------------------------------
-- Receipt event numbers RC-{fiscal year BE}-{0001}, assigned when a receipt is confirmed.
-- ---------------------------------------------------------------------------
create table if not exists public.bm_receipt_event_numbers (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique references public.bm_receipts(id),
  fiscal_year integer not null check (fiscal_year between 2500 and 3000),
  sequence_number integer not null check (sequence_number > 0),
  event_number text not null unique,
  assigned_retroactively boolean not null default false,
  assigned_at timestamptz not null default now(),
  unique (fiscal_year, sequence_number)
);
alter table public.bm_receipt_event_numbers enable row level security;
create policy bm_receipt_event_numbers_active_read on public.bm_receipt_event_numbers
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_receipt_event_numbers from public, anon, authenticated;
grant all on table public.bm_receipt_event_numbers to service_role;

create or replace function public.bm_assign_receipt_event_number(p_receipt uuid, p_retroactive boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_fy integer;
  v_seq integer;
begin
  select received_date into v_date from public.bm_receipts where id = p_receipt;
  if not found then raise exception 'BM_RECEIPT_NOT_FOUND'; end if;
  if exists (select 1 from public.bm_receipt_event_numbers where receipt_id = p_receipt) then return; end if;
  v_fy := public.bm_fiscal_year_be(v_date);
  perform pg_advisory_xact_lock(86420, v_fy);
  select coalesce(max(sequence_number), 0) + 1 into v_seq from public.bm_receipt_event_numbers where fiscal_year = v_fy;
  insert into public.bm_receipt_event_numbers (receipt_id, fiscal_year, sequence_number, event_number, assigned_retroactively)
  values (p_receipt, v_fy, v_seq, 'RC-' || v_fy || '-' || lpad(v_seq::text, 4, '0'), p_retroactive);
end;
$$;

do $$
declare v_id uuid;
begin
  for v_id in select id from public.bm_receipts where status = 'confirmed' order by confirmed_at nulls last, received_at, id loop
    perform public.bm_assign_receipt_event_number(v_id, true);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invoice completion: received quantity per line, automatic completion, closed_at stamp, short-close columns.
-- ---------------------------------------------------------------------------
alter table public.bm_invoices
  add column if not exists closed_at timestamptz,
  add column if not exists closed_short_at timestamptz,
  add column if not exists closed_short_by uuid references public.nipt_users(id),
  add column if not exists closed_short_reason text;
update public.bm_invoices set closed_at = updated_at where status = 'closed' and closed_at is null;
alter table public.bm_invoices
  add constraint bm_invoices_closed_short_check check (
    (closed_short_at is null and closed_short_by is null and closed_short_reason is null)
    or (status = 'closed' and closed_short_at is not null and closed_short_by is not null and length(btrim(coalesce(closed_short_reason, ''))) > 0)
  );

create or replace function public.bm_invoice_line_received(p_line uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(rl.received_qty), 0)::numeric
  from public.bm_receipt_lines rl
  join public.bm_receipts r on r.id = rl.receipt_id
  where rl.invoice_line_id = p_line and r.status = 'confirmed'
$$;

-- Confirming a receipt numbers it, opens its assessment (existing trigger) and completes the invoice lines it fulfils.
create or replace function public.bm_receipt_confirmed_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    perform public.bm_assign_receipt_event_number(new.id, false);
    perform public.bm_reconcile_receipt_line_issues(new.id, coalesce(new.confirmed_by, new.received_by));
    if new.invoice_id is not null then
      update public.bm_invoice_lines l set closure_state = 'complete'
      where l.invoice_id = new.invoice_id and l.closure_state = 'open' and public.bm_invoice_line_received(l.id) >= l.expected_qty;
      if not exists (select 1 from public.bm_invoice_lines where invoice_id = new.invoice_id and closure_state = 'open')
         and exists (select 1 from public.bm_invoice_lines where invoice_id = new.invoice_id and closure_state = 'complete') then
        update public.bm_invoices set status = 'closed', closed_at = now(), updated_at = now()
        where id = new.invoice_id and status in ('draft', 'open');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bm_receipts_confirmed_effects on public.bm_receipts;
create trigger bm_receipts_confirmed_effects
after insert or update of status on public.bm_receipts
for each row execute function public.bm_receipt_confirmed_effects();

-- ---------------------------------------------------------------------------
-- Receipt assessments: LABCBH answer rules
-- ---------------------------------------------------------------------------
alter table public.bm_receipt_assessments
  add column if not exists reason_codes text[] not null default '{}',
  add column if not exists other_reason_detail text,
  add column if not exists updated_by uuid references public.nipt_users(id);

alter table public.bm_receipt_assessments
  add column if not exists acceptance_decision text generated always as (
    case
      when status <> 'completed' then null
      when product_condition = 'abnormal' or documentation = 'incomplete' or item_correctness = 'problem'
        or cold_chain_condition = 'inappropriate' or has_complaint is true then 'accepted_with_justification'
      else 'accepted'
    end
  ) stored;

-- Assessments completed before this module have no reasons, so these two checks bind new and changed rows only.
alter table public.bm_receipt_assessments
  add constraint bm_receipt_assessments_reason_codes_valid check (
    reason_codes <@ array['urgent_need','no_alternative','usable_condition','vendor_will_correct','documentation_pending','consume_before_expiry','approved_exception','other']::text[]
  ),
  add constraint bm_receipt_assessments_reasons_match_decision check (
    status = 'pending'
    or (acceptance_decision = 'accepted_with_justification' and cardinality(reason_codes) > 0)
    or (acceptance_decision = 'accepted' and cardinality(reason_codes) = 0)
  ) not valid,
  add constraint bm_receipt_assessments_other_reason check (
    not ('other' = any(reason_codes)) or nullif(btrim(coalesce(other_reason_detail, '')), '') is not null
  ) not valid;

create table if not exists public.bm_receipt_assessment_revisions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.bm_receipt_assessments(id),
  revision_number integer not null check (revision_number > 0),
  before_state jsonb not null,
  after_state jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.nipt_users(id),
  unique (assessment_id, revision_number)
);
alter table public.bm_receipt_assessment_revisions enable row level security;
create policy bm_receipt_assessment_revisions_active_read on public.bm_receipt_assessment_revisions
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_receipt_assessment_revisions from public, anon, authenticated;
grant all on table public.bm_receipt_assessment_revisions to service_role;

-- One place turns posted answers into stored columns and enforces the LABCBH rules.
create or replace function public.bm_normalize_assessment(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_product text := p_data ->> 'productCondition';
  v_documentation text := p_data ->> 'documentation';
  v_item text := p_data ->> 'itemCorrectness';
  v_cold_applicable boolean := (p_data ->> 'coldChainApplicable')::boolean;
  v_cold text := nullif(p_data ->> 'coldChainCondition', '');
  v_complaint boolean := coalesce((p_data ->> 'hasComplaint')::boolean, false);
  v_note text := nullif(btrim(coalesce(p_data ->> 'note', '')), '');
  v_other text := nullif(btrim(coalesce(p_data ->> 'otherReasonDetail', '')), '');
  v_reasons text[];
  v_problem boolean;
begin
  if v_product is null or v_documentation is null or v_item is null or v_cold_applicable is null then raise exception 'BM_ASSESSMENT_REQUIRED'; end if;
  if v_product not in ('normal','abnormal') or v_documentation not in ('complete','incomplete') or v_item not in ('correct','problem') then raise exception 'BM_ASSESSMENT_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_data -> 'reasonCodes', '[]'::jsonb)) <> 'array' then raise exception 'BM_ASSESSMENT_REASON_INVALID'; end if;
  select coalesce(array_agg(distinct value), '{}') into v_reasons from jsonb_array_elements_text(coalesce(p_data -> 'reasonCodes', '[]'::jsonb));
  if not v_reasons <@ array['urgent_need','no_alternative','usable_condition','vendor_will_correct','documentation_pending','consume_before_expiry','approved_exception','other']::text[] then
    raise exception 'BM_ASSESSMENT_REASON_INVALID';
  end if;
  if v_cold_applicable then
    if v_cold is null or v_cold not in ('appropriate','inappropriate') then raise exception 'BM_ASSESSMENT_REQUIRED'; end if;
  else
    v_cold := null;
  end if;
  v_problem := v_product = 'abnormal' or v_documentation = 'incomplete' or v_item = 'problem' or v_cold = 'inappropriate' or v_complaint;
  if v_problem then
    if cardinality(v_reasons) = 0 then raise exception 'BM_ASSESSMENT_REASON_REQUIRED'; end if;
    if v_note is null then raise exception 'BM_ASSESSMENT_NOTE_REQUIRED'; end if;
  elsif cardinality(v_reasons) > 0 then
    raise exception 'BM_ASSESSMENT_REASON_NOT_ALLOWED';
  end if;
  if 'other' = any(v_reasons) and v_other is null then raise exception 'BM_ASSESSMENT_OTHER_REASON_REQUIRED'; end if;
  return jsonb_build_object(
    'product_condition', v_product, 'documentation', v_documentation, 'item_correctness', v_item,
    'cold_chain_applicable', v_cold_applicable, 'cold_chain_condition', v_cold, 'has_complaint', v_complaint,
    'note', v_note, 'reason_codes', to_jsonb(v_reasons), 'other_reason_detail', case when 'other' = any(v_reasons) then v_other end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vendor issues, LABCBH shape (existing columns keep their names)
-- ---------------------------------------------------------------------------
alter table public.bm_vendor_issues drop constraint if exists bm_vendor_issue_resolution_fields;
alter table public.bm_vendor_issues drop constraint if exists bm_vendor_issues_issue_type_check;

alter table public.bm_vendor_issues
  add column if not exists source_kind text not null default 'manual',
  add column if not exists invoice_id uuid references public.bm_invoices(id),
  add column if not exists assessment_id uuid references public.bm_receipt_assessments(id),
  add column if not exists invoice_line_id uuid references public.bm_invoice_lines(id),
  add column if not exists resolution_action text,
  add column if not exists cancelled_reason text,
  add column if not exists cancelled_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.nipt_users(id);

-- Older rows: resolved ones get a generic action, cancelled ones move their stamp to the cancel columns.
update public.bm_vendor_issues set
  cancelled_by = resolved_by, cancelled_at = resolved_at, cancelled_reason = 'other',
  cancelled_note = coalesce(nullif(btrim(coalesce(resolution_note, '')), ''), 'ไม่ระบุรายละเอียด (ข้อมูลก่อนใช้แบบฟอร์มใหม่)'),
  resolution_note = null, resolved_by = null, resolved_at = null
where resolution_status = 'cancelled' and cancelled_at is null;
update public.bm_vendor_issues set resolution_action = 'other',
  resolution_note = coalesce(nullif(btrim(coalesce(resolution_note, '')), ''), 'ไม่ระบุรายละเอียด (ข้อมูลก่อนใช้แบบฟอร์มใหม่)')
where resolution_status = 'resolved' and resolution_action is null;
update public.bm_vendor_issues set resolution_note = null, resolved_by = null, resolved_at = null where resolution_status = 'open';

alter table public.bm_vendor_issues
  add constraint bm_vendor_issues_type_check check (issue_type in ('packaging_damage','documentation_discrepancy','temperature_out_of_range','complaint','quantity_discrepancy','expiry_non_compliant','item_discrepancy','other')),
  add constraint bm_vendor_issues_source_check check (
    (source_kind = 'assessment' and assessment_id is not null and receipt_line_id is null and invoice_line_id is null)
    or (source_kind = 'receipt_line' and receipt_line_id is not null and assessment_id is null and invoice_line_id is null)
    or (source_kind = 'invoice_closure' and invoice_line_id is not null and assessment_id is null and receipt_line_id is null)
    or (source_kind = 'manual' and assessment_id is null and receipt_line_id is null and invoice_line_id is null)),
  add constraint bm_vendor_issues_resolution_action_check check (resolution_action is null or resolution_action in ('vendor_replaced_goods','vendor_supplied_documents','vendor_clarified_accepted','credit_note_received','verified_no_impact','vendor_warned','other')),
  add constraint bm_vendor_issues_cancel_reason_check check (cancelled_reason is null or cancelled_reason in ('duplicate','opened_in_error','other','assessment_corrected','invoice_reopened')),
  add constraint bm_vendor_issues_state_check check (
    (resolution_status = 'open' and resolution_action is null and resolution_note is null and resolved_at is null and resolved_by is null and cancelled_reason is null and cancelled_at is null and cancelled_by is null)
    or (resolution_status = 'resolved' and resolution_action is not null and length(btrim(coalesce(resolution_note, ''))) > 0 and resolved_at is not null and resolved_by is not null and cancelled_reason is null and cancelled_at is null and cancelled_by is null)
    or (resolution_status = 'cancelled' and cancelled_reason is not null and cancelled_at is not null and cancelled_by is not null
        and ((resolution_action is null and resolution_note is null and resolved_at is null and resolved_by is null)
          or (resolution_action is not null and length(btrim(coalesce(resolution_note, ''))) > 0 and resolved_at is not null and resolved_by is not null)))),
  add constraint bm_vendor_issues_cancel_note_check check (cancelled_reason is distinct from 'other' or length(btrim(coalesce(cancelled_note, ''))) > 0);

create unique index if not exists bm_vendor_issues_assessment_key on public.bm_vendor_issues (assessment_id, issue_type) where source_kind = 'assessment' and resolution_status <> 'cancelled';
create unique index if not exists bm_vendor_issues_receipt_line_key on public.bm_vendor_issues (receipt_line_id, issue_type) where source_kind = 'receipt_line' and resolution_status <> 'cancelled';
create unique index if not exists bm_vendor_issues_invoice_line_key on public.bm_vendor_issues (invoice_line_id, issue_type) where source_kind = 'invoice_closure' and resolution_status <> 'cancelled';

-- Assessment answers -> issues; a corrected assessment cancels the issues its old answers opened.
create or replace function public.bm_reconcile_assessment_issues(p_assessment uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.bm_receipt_assessments%rowtype;
  v_receipt public.bm_receipts%rowtype;
  v_desired text[] := array[]::text[];
  v_type text;
begin
  select * into v_a from public.bm_receipt_assessments where id = p_assessment for update;
  if not found then raise exception 'BM_ASSESSMENT_NOT_FOUND'; end if;
  select * into v_receipt from public.bm_receipts where id = v_a.receipt_id;
  if v_a.status = 'completed' then
    if v_a.product_condition = 'abnormal' then v_desired := array_append(v_desired, 'packaging_damage'); end if;
    if v_a.documentation = 'incomplete' then v_desired := array_append(v_desired, 'documentation_discrepancy'); end if;
    if v_a.item_correctness = 'problem' then v_desired := array_append(v_desired, 'item_discrepancy'); end if;
    if v_a.cold_chain_condition = 'inappropriate' then v_desired := array_append(v_desired, 'temperature_out_of_range'); end if;
    if v_a.has_complaint is true then v_desired := array_append(v_desired, 'complaint'); end if;
  end if;
  foreach v_type in array v_desired loop
    insert into public.bm_vendor_issues (vendor_id, receipt_id, invoice_id, description, issue_type, source_kind, assessment_id, opened_by)
    values (v_receipt.vendor_id, v_receipt.id, v_receipt.invoice_id, coalesce(v_a.note, 'พบความผิดปกติจากผลตรวจรับ'), v_type, 'assessment', v_a.id, p_actor)
    on conflict (assessment_id, issue_type) where source_kind = 'assessment' and resolution_status <> 'cancelled' do nothing;
  end loop;
  update public.bm_vendor_issues set resolution_status = 'cancelled', cancelled_reason = 'assessment_corrected',
    cancelled_note = 'ยกเลิกอัตโนมัติหลังแก้ไขผลตรวจรับ', cancelled_at = now(), cancelled_by = p_actor, updated_at = now()
  where source_kind = 'assessment' and assessment_id = p_assessment and resolution_status <> 'cancelled' and not (issue_type = any(v_desired));
end;
$$;

-- A line accepted although it failed the TOR expiry rule is an expiry-compliance issue for the vendor.
create or replace function public.bm_reconcile_receipt_line_issues(p_receipt uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.bm_receipts%rowtype;
  v_line record;
begin
  select * into v_r from public.bm_receipts where id = p_receipt;
  if not found then return; end if;
  if v_r.received_date < (select assessment_required_from from public.bm_vendor_evaluation_settings) then return; end if;
  for v_line in
    select rl.id as line_id, rl.lot_number, rl.expiry_date
    from public.bm_receipt_lines rl
    where rl.receipt_id = p_receipt and rl.tor_expiry_compliance = 'not_compliant'
  loop
    insert into public.bm_vendor_issues (vendor_id, receipt_id, invoice_id, description, issue_type, source_kind, receipt_line_id, opened_by)
    values (v_r.vendor_id, p_receipt, v_r.invoice_id,
            'สินค้าอายุคงเหลือไม่ถึงเกณฑ์ TOR: LOT ' || coalesce(v_line.lot_number, '-') || ' หมดอายุ ' || coalesce(v_line.expiry_date::text, '-'),
            'expiry_non_compliant', 'receipt_line', v_line.line_id, p_actor)
    on conflict (receipt_line_id, issue_type) where source_kind = 'receipt_line' and resolution_status <> 'cancelled' do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assessment RPCs
-- ---------------------------------------------------------------------------
create or replace function public.complete_bm_receipt_assessment(p_actor uuid, p_receipt uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.bm_receipts%rowtype;
  v_a public.bm_receipt_assessments%rowtype;
  v jsonb;
begin
  perform public.bm_require_role(p_actor, array['Admin','Staff']);
  select * into v_receipt from public.bm_receipts where id = p_receipt;
  if not found then raise exception 'BM_RECEIPT_NOT_FOUND'; end if;
  if v_receipt.status <> 'confirmed' then raise exception 'BM_RECEIPT_NOT_CONFIRMED'; end if;
  select * into v_a from public.bm_receipt_assessments where receipt_id = p_receipt for update;
  if not found then raise exception 'BM_ASSESSMENT_NOT_FOUND'; end if;
  if v_a.status <> 'pending' then raise exception 'BM_ASSESSMENT_ALREADY_COMPLETED'; end if;
  v := public.bm_normalize_assessment(p_data);
  update public.bm_receipt_assessments set
    status = 'completed', product_condition = v ->> 'product_condition', documentation = v ->> 'documentation', item_correctness = v ->> 'item_correctness',
    cold_chain_applicable = (v ->> 'cold_chain_applicable')::boolean, cold_chain_condition = v ->> 'cold_chain_condition',
    has_complaint = (v ->> 'has_complaint')::boolean, note = v ->> 'note',
    reason_codes = array(select jsonb_array_elements_text(v -> 'reason_codes')), other_reason_detail = v ->> 'other_reason_detail',
    assessed_by = p_actor, assessed_at = now(), updated_at = now(), updated_by = p_actor
  where id = v_a.id;
  perform public.bm_reconcile_assessment_issues(v_a.id, p_actor);
  perform public.bm_reconcile_receipt_line_issues(p_receipt, p_actor);
  perform public.bm_write_audit(p_actor, 'receiving.assessment.complete', 'stock-receipt-assessment', v_a.id, jsonb_build_object('receiptId', p_receipt, 'vendorId', v_receipt.vendor_id) || v);
  return v_a.id;
end;
$$;

create or replace function public.revise_bm_receipt_assessment(p_actor uuid, p_assessment uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.bm_receipt_assessments%rowtype;
  v_new public.bm_receipt_assessments%rowtype;
  v jsonb;
  v_rev integer;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_old from public.bm_receipt_assessments where id = p_assessment for update;
  if not found then raise exception 'BM_ASSESSMENT_NOT_FOUND'; end if;
  if v_old.status <> 'completed' then raise exception 'BM_ASSESSMENT_NOT_COMPLETED'; end if;
  v := public.bm_normalize_assessment(p_data);
  update public.bm_receipt_assessments set
    product_condition = v ->> 'product_condition', documentation = v ->> 'documentation', item_correctness = v ->> 'item_correctness',
    cold_chain_applicable = (v ->> 'cold_chain_applicable')::boolean, cold_chain_condition = v ->> 'cold_chain_condition',
    has_complaint = (v ->> 'has_complaint')::boolean, note = v ->> 'note',
    reason_codes = array(select jsonb_array_elements_text(v -> 'reason_codes')), other_reason_detail = v ->> 'other_reason_detail',
    updated_at = clock_timestamp(), updated_by = p_actor
  where id = p_assessment returning * into v_new;
  if to_jsonb(v_old) - 'updated_at' - 'updated_by' = to_jsonb(v_new) - 'updated_at' - 'updated_by' then raise exception 'BM_ASSESSMENT_UNCHANGED'; end if;
  select coalesce(max(revision_number), 0) + 1 into v_rev from public.bm_receipt_assessment_revisions where assessment_id = p_assessment;
  insert into public.bm_receipt_assessment_revisions (assessment_id, revision_number, before_state, after_state, changed_by)
  values (p_assessment, v_rev, to_jsonb(v_old), to_jsonb(v_new), p_actor);
  perform public.bm_reconcile_assessment_issues(p_assessment, p_actor);
  perform public.bm_write_audit(p_actor, 'receiving.assessment.revise', 'stock-receipt-assessment', p_assessment, jsonb_build_object('revision', v_rev));
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing an invoice short (LABCBH "closed_short"): Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.close_bm_invoice_short(p_actor uuid, p_invoice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.bm_invoices%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_line record;
  v_outstanding integer := 0;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_inv from public.bm_invoices where id = p_invoice for update;
  if not found then raise exception 'BM_INVOICE_NOT_FOUND'; end if;
  if v_inv.status <> 'open' then raise exception 'BM_INVOICE_NOT_OPEN'; end if;
  if v_reason is null then raise exception 'BM_REASON_REQUIRED'; end if;
  if exists (select 1 from public.bm_receipts where invoice_id = p_invoice and status = 'draft') then raise exception 'BM_INVOICE_HAS_DRAFT_RECEIPT'; end if;
  for v_line in
    select l.id, l.expected_qty, l.description_text, l.catalog_no_text, public.bm_invoice_line_received(l.id) as received
    from public.bm_invoice_lines l where l.invoice_id = p_invoice and l.closure_state = 'open' order by l.line_no
  loop
    if v_line.received >= v_line.expected_qty then
      update public.bm_invoice_lines set closure_state = 'complete' where id = v_line.id;
    else
      v_outstanding := v_outstanding + 1;
      update public.bm_invoice_lines set closure_state = 'short_closed', short_reason_code = 'invoice_closed_short', short_reason_note = v_reason where id = v_line.id;
      insert into public.bm_vendor_issues (vendor_id, invoice_id, description, issue_type, source_kind, invoice_line_id, opened_by)
      values (v_inv.vendor_id, p_invoice,
              'จำนวนส่งมอบไม่ครบ: ' || coalesce(v_line.description_text, v_line.catalog_no_text, 'รายการ') || ' สั่ง ' || trim_scale(v_line.expected_qty)::text
                || ' รับ ' || trim_scale(v_line.received)::text || ' ค้าง ' || trim_scale(v_line.expected_qty - v_line.received)::text || ' · ' || v_reason,
              'quantity_discrepancy', 'invoice_closure', v_line.id, p_actor)
      on conflict (invoice_line_id, issue_type) where source_kind = 'invoice_closure' and resolution_status <> 'cancelled' do nothing;
    end if;
  end loop;
  if v_outstanding = 0 then raise exception 'BM_INVOICE_NOTHING_OUTSTANDING'; end if;
  update public.bm_invoices set status = 'closed', closed_at = now(), closed_short_at = clock_timestamp(), closed_short_by = p_actor,
    closed_short_reason = v_reason, updated_at = now() where id = p_invoice;
  perform public.bm_write_audit(p_actor, 'receiving.invoice.close-short', 'stock-invoice', p_invoice, jsonb_build_object('reason', v_reason, 'outstandingLines', v_outstanding));
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual issue RPCs (open: Admin/Staff; resolve and cancel: Admin)
-- ---------------------------------------------------------------------------
create or replace function public.open_bm_vendor_issue(p_actor uuid, p_vendor uuid, p_issue_type text, p_description text, p_receipt uuid default null, p_invoice uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  perform public.bm_require_role(p_actor, array['Admin','Staff']);
  if v_description is null then raise exception 'BM_ISSUE_DESCRIPTION_REQUIRED'; end if;
  if not exists (select 1 from public.bm_vendors where id = p_vendor) then raise exception 'BM_VENDOR_NOT_FOUND'; end if;
  if p_invoice is not null and not exists (select 1 from public.bm_invoices where id = p_invoice and vendor_id = p_vendor) then raise exception 'BM_VENDOR_INVOICE_INVALID'; end if;
  if p_receipt is not null and not exists (select 1 from public.bm_receipts where id = p_receipt and vendor_id = p_vendor) then raise exception 'BM_VENDOR_RECEIPT_INVALID'; end if;
  insert into public.bm_vendor_issues (vendor_id, receipt_id, invoice_id, description, issue_type, source_kind, opened_by)
  values (p_vendor, p_receipt, p_invoice, v_description, p_issue_type, 'manual', p_actor) returning id into v_id;
  perform public.bm_write_audit(p_actor, 'vendor.issue.open', 'stock-vendor-issue', v_id, jsonb_build_object('vendorId', p_vendor, 'issueType', p_issue_type));
  return v_id;
end;
$$;

create or replace function public.resolve_bm_vendor_issue(p_actor uuid, p_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.bm_vendor_issues%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_issue from public.bm_vendor_issues where id = p_id for update;
  if not found then raise exception 'BM_ISSUE_NOT_FOUND'; end if;
  if p_action is null or v_note is null then raise exception 'BM_ISSUE_RESOLUTION_REQUIRED'; end if;
  if v_issue.resolution_status <> 'open' then raise exception 'BM_ISSUE_NOT_OPEN'; end if;
  update public.bm_vendor_issues set resolution_status = 'resolved', resolution_action = p_action, resolution_note = v_note,
    resolved_at = now(), resolved_by = p_actor, updated_at = now() where id = p_id;
  perform public.bm_write_audit(p_actor, 'vendor.issue.resolve', 'stock-vendor-issue', p_id, jsonb_build_object('action', p_action));
end;
$$;

create or replace function public.cancel_bm_vendor_issue(p_actor uuid, p_id uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.bm_vendor_issues%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_issue from public.bm_vendor_issues where id = p_id for update;
  if not found then raise exception 'BM_ISSUE_NOT_FOUND'; end if;
  if p_reason not in ('duplicate','opened_in_error','other') then raise exception 'BM_ISSUE_CANCEL_REASON_INVALID'; end if;
  if p_reason = 'other' and v_note is null then raise exception 'BM_ISSUE_CANCEL_NOTE_REQUIRED'; end if;
  if v_issue.resolution_status = 'cancelled' then raise exception 'BM_ISSUE_ALREADY_CANCELLED'; end if;
  update public.bm_vendor_issues set resolution_status = 'cancelled', cancelled_reason = p_reason, cancelled_note = v_note,
    cancelled_at = now(), cancelled_by = p_actor, updated_at = now() where id = p_id;
  perform public.bm_write_audit(p_actor, 'vendor.issue.cancel', 'stock-vendor-issue', p_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service role only, as every other function in this schema.
-- ---------------------------------------------------------------------------
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'bm_fiscal_year_be(date)', 'bm_require_role(uuid,text[])', 'bm_write_audit(uuid,text,text,uuid,jsonb)', 'bm_text(jsonb,text)',
    'bm_assert_vendor_fields(jsonb)', 'bm_assert_vendor_unique(uuid,text,text,text,text)',
    'create_bm_vendor(uuid,jsonb)', 'update_bm_vendor(uuid,uuid,jsonb,timestamptz)', 'set_bm_vendor_active(uuid,uuid,boolean,text)',
    'bm_assign_receipt_event_number(uuid,boolean)', 'bm_invoice_line_received(uuid)', 'bm_receipt_confirmed_effects()',
    'bm_normalize_assessment(jsonb)', 'bm_reconcile_assessment_issues(uuid,uuid)', 'bm_reconcile_receipt_line_issues(uuid,uuid)',
    'complete_bm_receipt_assessment(uuid,uuid,jsonb)', 'revise_bm_receipt_assessment(uuid,uuid,jsonb)', 'close_bm_invoice_short(uuid,uuid,text)',
    'open_bm_vendor_issue(uuid,uuid,text,text,uuid,uuid)', 'resolve_bm_vendor_issue(uuid,uuid,text,text)', 'cancel_bm_vendor_issue(uuid,uuid,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
