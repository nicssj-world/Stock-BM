-- Vendor evaluation port from LABCBH-Stock, part 2: versioned evaluation policy (8 weighted criteria).
-- The work group's QP is LABCBH-Stock's, so V1 starts from the numbers LABCBH-Stock approved (VE-POLICY-V1, approved
-- 23 Sep 2569): pass 80%, minimum coverage 80%, from fiscal year 2569, data from 2026-09-23, weights 20/15/10/10/15/15/10/5.
-- It stays a PROPOSAL: an Admin still approves it, which records who approved and freezes it.

create table if not exists public.bm_vendor_evaluation_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'retired')),
  effective_from_fiscal_year integer not null check (effective_from_fiscal_year between 2500 and 3000),
  effective_to_fiscal_year integer check (effective_to_fiscal_year between 2500 and 3000 and effective_to_fiscal_year >= effective_from_fiscal_year),
  pass_threshold numeric(5,2) check (pass_threshold between 0 and 100),
  minimum_coverage_percent numeric(5,2) check (minimum_coverage_percent between 0 and 100),
  coverage_start_date date not null,
  note text,
  approved_at timestamptz,
  approved_by uuid references public.nipt_users(id),
  approved_by_name_snapshot text,
  created_at timestamptz not null default now(),
  created_by uuid references public.nipt_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.nipt_users(id),
  constraint bm_vendor_evaluation_policies_version_key unique (version),
  constraint bm_vendor_evaluation_policies_version_not_blank check (nullif(btrim(version), '') is not null),
  constraint bm_vendor_evaluation_policies_approval_check check (
    (status = 'approved' and pass_threshold is not null and minimum_coverage_percent is not null and approved_at is not null and approved_by is not null
      and nullif(btrim(coalesce(approved_by_name_snapshot, '')), '') is not null)
    or (status = 'proposed' and approved_at is null and approved_by is null and approved_by_name_snapshot is null)
    or (status = 'retired' and approved_at is not null and approved_by is not null and nullif(btrim(coalesce(approved_by_name_snapshot, '')), '') is not null)
  )
);

create table if not exists public.bm_vendor_evaluation_policy_criteria (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.bm_vendor_evaluation_policies(id),
  criterion_code text not null check (criterion_code in ('delivery_completeness','shelf_life','product_packaging','documentation','item_correctness','cold_chain','complaint_performance','corrective_action')),
  display_order integer not null check (display_order between 1 and 8),
  label text not null check (nullif(btrim(label), '') is not null),
  weight numeric(5,2) check (weight > 0 and weight <= 100),
  evidence_definition text not null check (nullif(btrim(evidence_definition), '') is not null),
  calculation_definition text not null check (nullif(btrim(calculation_definition), '') is not null),
  na_definition text not null check (nullif(btrim(na_definition), '') is not null),
  constraint bm_vendor_evaluation_policy_criteria_code_key unique (policy_id, criterion_code),
  constraint bm_vendor_evaluation_policy_criteria_order_key unique (policy_id, display_order)
);

alter table public.bm_vendor_evaluation_policies enable row level security;
alter table public.bm_vendor_evaluation_policy_criteria enable row level security;
create policy bm_vendor_evaluation_policies_active_read on public.bm_vendor_evaluation_policies
for select using (public.current_bm_role() is not null);
create policy bm_vendor_evaluation_policy_criteria_active_read on public.bm_vendor_evaluation_policy_criteria
for select using (public.current_bm_role() is not null);
revoke all on table public.bm_vendor_evaluation_policies from public, anon, authenticated;
grant all on table public.bm_vendor_evaluation_policies to service_role;
revoke all on table public.bm_vendor_evaluation_policy_criteria from public, anon, authenticated;
grant all on table public.bm_vendor_evaluation_policy_criteria to service_role;

-- Approved or retired policies, and their criteria, are frozen.
create or replace function public.bm_guard_vendor_evaluation_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The one change an approved policy allows: its last fiscal year moves earlier when a newer policy takes over.
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved' and new.effective_to_fiscal_year is not null
     and (old.effective_to_fiscal_year is null or new.effective_to_fiscal_year < old.effective_to_fiscal_year)
     and (to_jsonb(new) - 'effective_to_fiscal_year' - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'effective_to_fiscal_year' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  if old.status <> 'proposed' then raise exception 'BM_POLICY_FROZEN' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger bm_vendor_evaluation_policies_guard before update or delete on public.bm_vendor_evaluation_policies
for each row execute function public.bm_guard_vendor_evaluation_policy();

create or replace function public.bm_guard_vendor_evaluation_policy_criterion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.bm_vendor_evaluation_policies p where p.id = coalesce(new.policy_id, old.policy_id) and p.status = 'proposed') then
    raise exception 'BM_POLICY_FROZEN' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger bm_vendor_evaluation_policy_criteria_guard before insert or update or delete on public.bm_vendor_evaluation_policy_criteria
for each row execute function public.bm_guard_vendor_evaluation_policy_criterion();

-- Canonical definitions (LABCBH wording; purchase-order terms become Invoice terms, shelf life follows Stock-BM's TOR rule).
with seeded as (
  insert into public.bm_vendor_evaluation_policies (version, status, effective_from_fiscal_year, pass_threshold, minimum_coverage_percent, coverage_start_date, note)
  values ('VE-POLICY-V1', 'proposed', 2569, 80, 80, date '2026-09-23',
          'ตัวเลขตามนโยบายที่อนุมัติแล้วของ LABCBH-Stock (VE-POLICY-V1 อนุมัติ 23 ก.ย. 2569) · รอผู้ดูแลระบบของ Stock-BM อนุมัติ')
  returning id
)
insert into public.bm_vendor_evaluation_policy_criteria (policy_id, criterion_code, display_order, label, weight, evidence_definition, calculation_definition, na_definition)
select seeded.id, c.code, c.display_order, c.label, c.weight, c.evidence_definition, c.calculation_definition, c.na_definition
from seeded cross join (values
  ('delivery_completeness', 1, 'การส่งมอบ / ความครบถ้วน', 20,
    'รายการใน Invoice ที่ถึงสถานะสิ้นสุด (รับครบ หรือปิดแบบรับไม่ครบ) ในปีงบประมาณ',
    'รายการที่รับครบเป็นตัวตั้ง รายการทั้งหมดของ Invoice ที่สิ้นสุดแล้วเป็นตัวหาร',
    'ไม่มี Invoice ที่ถึงสถานะสิ้นสุดในปีงบประมาณ'),
  ('shelf_life', 2, 'อายุสินค้า ณ วันที่รับ', 15,
    'รายการรับเข้าที่มีวันหมดอายุ ตรวจตามเกณฑ์อายุคงเหลือ (TOR) ณ วันที่รับ',
    'รายการที่ผ่านเกณฑ์ TOR เป็นตัวตั้ง รายการที่มีวันหมดอายุเป็นตัวหาร',
    'ไม่มีหลักฐานวันหมดอายุของรายการรับเข้า'),
  ('product_packaging', 3, 'สภาพสินค้า / บรรจุภัณฑ์', 10,
    'ผลตรวจรับที่บันทึกแล้ว',
    'ผลปกติเป็นตัวตั้ง ผลตรวจรับที่บันทึกแล้วเป็นตัวหาร',
    'ไม่มีผลตรวจรับที่บันทึกแล้ว'),
  ('documentation', 4, 'เอกสารประกอบ', 10,
    'ผลตรวจรับที่บันทึกแล้ว',
    'เอกสารครบเป็นตัวตั้ง ผลตรวจรับที่บันทึกแล้วเป็นตัวหาร',
    'ไม่มีผลตรวจรับที่บันทึกแล้ว'),
  ('item_correctness', 5, 'ความถูกต้องของรายการ', 15,
    'ผลตรวจรับที่บันทึกแล้ว',
    'รายการถูกต้องเป็นตัวตั้ง ผลตรวจรับที่บันทึกแล้วเป็นตัวหาร',
    'ไม่มีผลตรวจรับที่บันทึกแล้ว'),
  ('cold_chain', 6, 'การควบคุมอุณหภูมิ', 15,
    'ผลตรวจรับของสินค้าที่ต้องควบคุมอุณหภูมิ',
    'สภาพอุณหภูมิเหมาะสมเป็นตัวตั้ง ผลตรวจรับที่ต้องควบคุมอุณหภูมิเป็นตัวหาร',
    'ผู้ขายไม่มีสินค้าที่ต้องควบคุมอุณหภูมิ'),
  ('complaint_performance', 7, 'ข้อร้องเรียน / ปัญหา', 10,
    'ผลตรวจรับที่บันทึกแล้ว และจำนวนข้อร้องเรียนที่บันทึกด้วยมือแยกต่างหาก',
    'ผลตรวจรับที่ไม่มีข้อร้องเรียนเป็นตัวตั้ง ผลตรวจรับที่บันทึกแล้วเป็นตัวหาร',
    'ไม่มีผลตรวจรับที่บันทึกแล้ว'),
  ('corrective_action', 8, 'การแก้ไขปัญหา', 5,
    'ปัญหาทุกประเภทและทุกแหล่งที่มา ยกเว้นรายการที่ถูกยกเลิก',
    'ปัญหาที่แก้ไขแล้วเป็นตัวตั้ง ปัญหาที่ไม่ถูกยกเลิกทั้งหมดเป็นตัวหาร',
    'ผู้ขายไม่มีปัญหาที่ไม่ถูกยกเลิก')
) as c(code, display_order, label, weight, evidence_definition, calculation_definition, na_definition);

-- The policy that applies to a fiscal year: an approved one if there is one, otherwise the newest proposal.
create or replace function public.bm_policy_for_fiscal_year(p_fy integer)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.bm_vendor_evaluation_policies
   where status in ('proposed', 'approved') and effective_from_fiscal_year <= p_fy and coalesce(effective_to_fiscal_year, 3000) >= p_fy
   order by (status = 'approved') desc, created_at desc limit 1
$$;

create or replace function public.save_bm_vendor_evaluation_policy_proposal(p_actor uuid, p_policy_id uuid, p_policy jsonb, p_criteria jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bm_vendor_evaluation_policies%rowtype;
  v_template uuid;
  v_item jsonb;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  if p_policy is null or jsonb_typeof(p_policy) <> 'object' or p_criteria is null or jsonb_typeof(p_criteria) <> 'array' then raise exception 'BM_POLICY_INPUT_INVALID'; end if;
  if exists (select 1 from jsonb_object_keys(p_policy) k where k not in ('version','effectiveFromFiscalYear','effectiveToFiscalYear','passThreshold','minimumCoveragePercent','coverageStartDate','note')) then raise exception 'BM_POLICY_INPUT_INVALID'; end if;
  if jsonb_array_length(p_criteria) <> 8 then raise exception 'BM_POLICY_CRITERIA_INCOMPLETE'; end if;
  if exists (select 1 from jsonb_array_elements(p_criteria) i where exists (select 1 from jsonb_object_keys(i) k where k not in ('criterionCode','weight'))) then raise exception 'BM_POLICY_INPUT_INVALID'; end if;
  if (select count(distinct i ->> 'criterionCode') from jsonb_array_elements(p_criteria) i) <> 8 then raise exception 'BM_POLICY_CRITERIA_INCOMPLETE'; end if;
  if (select sum((i ->> 'weight')::numeric) from jsonb_array_elements(p_criteria) i) is distinct from 100::numeric then raise exception 'BM_POLICY_WEIGHT_TOTAL'; end if;

  if p_policy_id is null then
    -- Definitions come from the first policy ever created (the seed), whatever it has since been renamed to.
    select id into v_template from public.bm_vendor_evaluation_policies order by created_at, id limit 1;
    insert into public.bm_vendor_evaluation_policies (version, status, effective_from_fiscal_year, effective_to_fiscal_year, pass_threshold, minimum_coverage_percent, coverage_start_date, note, created_by, updated_by)
    values (nullif(btrim(p_policy ->> 'version'), ''), 'proposed', (p_policy ->> 'effectiveFromFiscalYear')::integer, nullif(p_policy ->> 'effectiveToFiscalYear', '')::integer,
            (p_policy ->> 'passThreshold')::numeric, (p_policy ->> 'minimumCoveragePercent')::numeric, (p_policy ->> 'coverageStartDate')::date,
            nullif(btrim(coalesce(p_policy ->> 'note', '')), ''), p_actor, p_actor) returning * into v_row;
    insert into public.bm_vendor_evaluation_policy_criteria (policy_id, criterion_code, display_order, label, weight, evidence_definition, calculation_definition, na_definition)
    select v_row.id, base.criterion_code, base.display_order, base.label, (i ->> 'weight')::numeric, base.evidence_definition, base.calculation_definition, base.na_definition
    from jsonb_array_elements(p_criteria) i join public.bm_vendor_evaluation_policy_criteria base on base.policy_id = v_template and base.criterion_code = i ->> 'criterionCode';
    if (select count(*) from public.bm_vendor_evaluation_policy_criteria where policy_id = v_row.id) <> 8 then raise exception 'BM_POLICY_CRITERIA_INCOMPLETE'; end if;
  else
    select * into v_row from public.bm_vendor_evaluation_policies where id = p_policy_id for update;
    if not found then raise exception 'BM_POLICY_NOT_FOUND'; end if;
    if v_row.status <> 'proposed' then raise exception 'BM_POLICY_FROZEN' using errcode = '55000'; end if;
    update public.bm_vendor_evaluation_policies set version = nullif(btrim(p_policy ->> 'version'), ''), effective_from_fiscal_year = (p_policy ->> 'effectiveFromFiscalYear')::integer,
      effective_to_fiscal_year = nullif(p_policy ->> 'effectiveToFiscalYear', '')::integer, pass_threshold = (p_policy ->> 'passThreshold')::numeric,
      minimum_coverage_percent = (p_policy ->> 'minimumCoveragePercent')::numeric, coverage_start_date = (p_policy ->> 'coverageStartDate')::date,
      note = nullif(btrim(coalesce(p_policy ->> 'note', '')), ''), updated_at = now(), updated_by = p_actor
    where id = p_policy_id returning * into v_row;
    for v_item in select value from jsonb_array_elements(p_criteria) loop
      update public.bm_vendor_evaluation_policy_criteria set weight = (v_item ->> 'weight')::numeric where policy_id = v_row.id and criterion_code = v_item ->> 'criterionCode';
      if not found then raise exception 'BM_POLICY_CRITERIA_INCOMPLETE'; end if;
    end loop;
  end if;
  perform public.bm_write_audit(p_actor, 'vendor.policy.save', 'stock-vendor-evaluation-policy', v_row.id, jsonb_build_object('version', v_row.version));
  return v_row.id;
end;
$$;

create or replace function public.approve_bm_vendor_evaluation_policy(p_actor uuid, p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bm_vendor_evaluation_policies%rowtype;
  v_name text;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  select * into v_row from public.bm_vendor_evaluation_policies where id = p_policy_id for update;
  if not found then raise exception 'BM_POLICY_NOT_FOUND'; end if;
  if v_row.status <> 'proposed' then raise exception 'BM_POLICY_NOT_PROPOSED'; end if;
  if v_row.pass_threshold is null or v_row.minimum_coverage_percent is null
     or (select count(*) from public.bm_vendor_evaluation_policy_criteria c where c.policy_id = v_row.id and c.weight is not null) <> 8
     or (select sum(c.weight) from public.bm_vendor_evaluation_policy_criteria c where c.policy_id = v_row.id) is distinct from 100::numeric then
    raise exception 'BM_POLICY_INCOMPLETE';
  end if;
  -- A newer QP takes over from its first year: the approved policy it follows ends the year before. Final reports keep the policy they were made under.
  update public.bm_vendor_evaluation_policies o set effective_to_fiscal_year = v_row.effective_from_fiscal_year - 1, updated_at = now(), updated_by = p_actor
   where o.id <> v_row.id and o.status = 'approved' and o.effective_from_fiscal_year < v_row.effective_from_fiscal_year
     and coalesce(o.effective_to_fiscal_year, 3000) >= v_row.effective_from_fiscal_year
     and (v_row.effective_to_fiscal_year is null or (o.effective_to_fiscal_year is not null and o.effective_to_fiscal_year <= v_row.effective_to_fiscal_year));
  if exists (select 1 from public.bm_vendor_evaluation_policies o where o.id <> v_row.id and o.status = 'approved'
             and o.effective_from_fiscal_year <= coalesce(v_row.effective_to_fiscal_year, 3000) and coalesce(o.effective_to_fiscal_year, 3000) >= v_row.effective_from_fiscal_year) then
    raise exception 'BM_POLICY_OVERLAP';
  end if;
  select display_name into v_name from public.nipt_users where id = p_actor;
  update public.bm_vendor_evaluation_policies set status = 'approved', approved_at = now(), approved_by = p_actor,
    approved_by_name_snapshot = coalesce(v_name, 'ผู้ดูแลระบบ'), updated_at = now(), updated_by = p_actor where id = p_policy_id;
  perform public.bm_write_audit(p_actor, 'vendor.policy.approve', 'stock-vendor-evaluation-policy', p_policy_id, jsonb_build_object('version', v_row.version));
end;
$$;

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'bm_guard_vendor_evaluation_policy()', 'bm_guard_vendor_evaluation_policy_criterion()', 'bm_policy_for_fiscal_year(integer)',
    'save_bm_vendor_evaluation_policy_proposal(uuid,uuid,jsonb,jsonb)', 'approve_bm_vendor_evaluation_policy(uuid,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', v_fn);
    execute format('grant execute on function public.%s to service_role', v_fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
