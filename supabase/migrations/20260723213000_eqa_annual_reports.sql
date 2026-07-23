-- Annual EQA planning, receipt records, report approvals, and printable
-- Fm-QP-LAB-19/01, /02, and /04 document support.

create table public.eqa_annual_plans (
  id uuid primary key default gen_random_uuid(),
  plan_year integer not null unique check (plan_year between 2000 and 2200),
  work_section text not null default 'งานอณูชีววิทยา' check (nullif(trim(work_section), '') is not null),
  department_name text not null default 'กลุ่มงานเทคนิคการแพทย์' check (nullif(trim(department_name), '') is not null),
  organization_name text not null default 'โรงพยาบาลชลบุรี' check (nullif(trim(organization_name), '') is not null),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.eqa_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.eqa_annual_plans(id) on delete cascade,
  scheme_id uuid not null references public.eqa_schemes(id),
  project_name text not null check (nullif(trim(project_name), '') is not null),
  provider_name text not null check (nullif(trim(provider_name), '') is not null),
  sample_set_name text not null check (nullif(trim(sample_set_name), '') is not null),
  external_code text,
  test_item text not null check (nullif(trim(test_item), '') is not null),
  expected_rounds integer check (expected_rounds is null or expected_rounds > 0),
  maintenance_budget boolean not null default false,
  tor boolean not null default false,
  price numeric(14, 2) check (price is null or price >= 0),
  evaluation_criteria text,
  equipment_name text,
  note text,
  sort_order integer not null default 0,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, scheme_id)
);

create table public.eqa_plan_occurrences (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid not null references public.eqa_plan_items(id) on delete cascade,
  planned_month integer not null check (planned_month between 1 and 12),
  responsible_user_id uuid references public.nipt_users(id),
  responsible_code text not null check (nullif(trim(responsible_code), '') is not null),
  sort_order integer not null default 0,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

alter table public.eqa_rounds
  add column if not exists plan_item_id uuid references public.eqa_plan_items(id),
  add column if not exists external_sent_date date,
  add column if not exists package_condition text check (package_condition is null or package_condition in ('acceptable', 'unacceptable')),
  add column if not exists package_note text,
  add column if not exists received_temperature text check (received_temperature is null or received_temperature in ('refrigerated', 'room', 'other')),
  add column if not exists received_temperature_note text,
  add column if not exists sample_condition text check (sample_condition is null or sample_condition in ('acceptable', 'unacceptable')),
  add column if not exists sample_condition_note text,
  add column if not exists storage_condition text check (storage_condition is null or storage_condition in ('refrigerated', 'room', 'other')),
  add column if not exists storage_temperature_c numeric,
  add column if not exists storage_note text,
  add column if not exists specimen_type text,
  add column if not exists receiver_id uuid references public.nipt_users(id),
  add column if not exists analyst_id uuid references public.nipt_users(id),
  add column if not exists analysis_date date,
  add column if not exists submission_method text,
  add column if not exists other_details text,
  add column if not exists summary_outcome text not null default 'not-evaluated' check (summary_outcome in ('pass', 'fail', 'not-evaluated')),
  add column if not exists summary_note text;

alter table public.eqa_results
  add column if not exists sample_code text,
  add column if not exists unit text,
  add column if not exists ct_value numeric;

create table public.eqa_approver_assignments (
  approval_role text primary key check (approval_role in ('technical-manager', 'quality-manager', 'section-head', 'department-head')),
  user_id uuid not null references public.nipt_users(id),
  updated_by uuid not null references public.nipt_users(id),
  updated_at timestamptz not null default now()
);

create table public.eqa_document_states (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('annual-plan', 'round-receipt', 'annual-summary')),
  entity_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  updated_at timestamptz not null default now(),
  unique (document_type, entity_id)
);

create table public.eqa_document_approvals (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('annual-plan', 'round-receipt', 'annual-summary')),
  entity_id uuid not null,
  revision integer not null check (revision > 0),
  approval_role text not null check (approval_role in ('analyst', 'technical-manager', 'quality-manager', 'section-head', 'department-head')),
  approved_by uuid not null references public.nipt_users(id),
  approved_at timestamptz not null default now(),
  unique (document_type, entity_id, revision, approval_role)
);

create index eqa_plan_items_plan on public.eqa_plan_items(plan_id, sort_order);
create index eqa_plan_occurrences_item on public.eqa_plan_occurrences(plan_item_id, planned_month, sort_order);
create index eqa_rounds_plan_item on public.eqa_rounds(plan_item_id);
create index eqa_document_approvals_current on public.eqa_document_approvals(document_type, entity_id, revision);

alter table public.eqa_annual_plans enable row level security;
alter table public.eqa_plan_items enable row level security;
alter table public.eqa_plan_occurrences enable row level security;
alter table public.eqa_approver_assignments enable row level security;
alter table public.eqa_document_states enable row level security;
alter table public.eqa_document_approvals enable row level security;

create policy eqa_annual_plans_read on public.eqa_annual_plans for select using (public.current_bm_role() is not null);
create policy eqa_plan_items_read on public.eqa_plan_items for select using (public.current_bm_role() is not null);
create policy eqa_plan_occurrences_read on public.eqa_plan_occurrences for select using (public.current_bm_role() is not null);
create policy eqa_approver_assignments_read on public.eqa_approver_assignments for select using (public.current_bm_role() is not null);
create policy eqa_document_states_read on public.eqa_document_states for select using (public.current_bm_role() is not null);
create policy eqa_document_approvals_read on public.eqa_document_approvals for select using (public.current_bm_role() is not null);
