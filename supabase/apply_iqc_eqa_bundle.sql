-- ============================================================
-- Molecular-CBH QMS — IQC + EQA migration bundle (IDEMPOTENT)
-- Apply in Supabase Dashboard > SQL Editor (shared project with Genomic-CBH)
-- Safe to re-run: uses 'if not exists' + 'drop policy if exists' so a prior
-- partial apply will not error. Wrapped in one transaction (all-or-nothing).
-- Combines migrations 202606190001..0005. Generated 2026-06-21.
-- ============================================================

begin;

-- ───────────────────────────────────────────────────────────
-- 202606190001_bm_attachments.sql
-- ───────────────────────────────────────────────────────────
-- Shared file attachments for the quality modules (IQC / EQA) and stock.
-- Files live in a private Supabase Storage bucket; all access goes through the
-- service-role admin client (no anon/public access), so no storage.objects RLS
-- policies are required. Metadata is tracked in bm_attachments.

create table if not exists public.bm_attachments (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('iqc', 'eqa', 'stock')),
  entity_type text not null check (nullif(trim(entity_type), '') is not null),
  entity_id uuid,
  kind text not null check (nullif(trim(kind), '') is not null),
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create index if not exists bm_attachments_entity on public.bm_attachments(module, entity_type, entity_id);
create index if not exists bm_attachments_created_at on public.bm_attachments(created_at desc);

alter table public.bm_attachments enable row level security;

drop policy if exists bm_attachments_active_read on public.bm_attachments;
create policy bm_attachments_active_read on public.bm_attachments
for select using (public.current_bm_role() is not null);

-- Private bucket for quality documents (corrective actions, EQA certificates, etc.)
insert into storage.buckets (id, name, public)
values ('bm-quality', 'bm-quality', false)
on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────────
-- 202606190002_iqc_core.sql
-- ───────────────────────────────────────────────────────────
-- IQC core (Internal Quality Control). Supports both linear (e.g. CD4 flow) and
-- log10 (viral load) analytes. Runs in the same Supabase project as the stock
-- module; reuses nipt_users + current_bm_role() for auth, RLS read for any active
-- BM role, writes via service-role admin client only (no security-definer RPC).

create table if not exists public.iqc_analytes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  data_type text not null default 'quantitative' check (data_type in ('quantitative', 'qualitative')),
  scale text not null default 'linear' check (scale in ('linear', 'log10')),
  is_absolute boolean not null default false,
  unit text,
  group_label text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.iqc_instruments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  model text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.iqc_control_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null),
  level text,
  manufacturer text,
  stock_item_id uuid references public.bm_stock_items(id),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.iqc_control_lots (
  id uuid primary key default gen_random_uuid(),
  control_material_id uuid not null references public.iqc_control_materials(id),
  lot_number text not null check (nullif(trim(lot_number), '') is not null),
  expiry_date date,
  stock_lot_id uuid references public.bm_stock_lots(id),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (control_material_id, lot_number)
);

-- One spec row per (control_lot x analyte): holds both the manufacturer-assigned
-- limits and the lab-established cumulative mean/SD. active_limit selects which
-- the Westgard evaluation uses.
create table if not exists public.iqc_control_specs (
  id uuid primary key default gen_random_uuid(),
  control_lot_id uuid not null references public.iqc_control_lots(id),
  analyte_id uuid not null references public.iqc_analytes(id),
  assigned_mean numeric,
  assigned_sd numeric check (assigned_sd is null or assigned_sd >= 0),
  lab_mean numeric,
  lab_sd numeric check (lab_sd is null or lab_sd >= 0),
  lab_n integer check (lab_n is null or lab_n >= 0),
  lab_locked_at timestamptz,
  active_limit text not null default 'assigned' check (active_limit in ('assigned', 'lab')),
  expected_qualitative text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (control_lot_id, analyte_id)
);

create table if not exists public.iqc_runs (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.iqc_instruments(id),
  run_no integer,
  run_datetime timestamptz not null default now(),
  note text,
  entered_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

-- Consumable lots used in a run (staining reagent, BD Trucount tube, master mix...).
-- applies_scope = 'absolute-only' marks consumables (Trucount) that affect only
-- absolute-count analytes so the UI annotates the right Levey-Jennings charts.
create table if not exists public.iqc_run_consumables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.iqc_runs(id) on delete cascade,
  kind text not null check (kind in ('staining-reagent', 'trucount-tube', 'mastermix', 'reagent', 'other')),
  lot_number text not null check (nullif(trim(lot_number), '') is not null),
  stock_lot_id uuid references public.bm_stock_lots(id),
  applies_scope text not null default 'all' check (applies_scope in ('all', 'absolute-only')),
  bead_count_per_tube numeric check (bead_count_per_tube is null or bead_count_per_tube > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.iqc_result_values (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.iqc_runs(id) on delete cascade,
  control_lot_id uuid not null references public.iqc_control_lots(id),
  analyte_id uuid not null references public.iqc_analytes(id),
  numeric_value numeric,
  stat_value numeric,
  qualitative_value text,
  z_score numeric,
  violated_rules text[] not null default '{}',
  status text not null default 'accepted' check (status in ('accepted', 'warning', 'rejected')),
  is_voided boolean not null default false,
  void_reason text,
  created_at timestamptz not null default now(),
  unique (run_id, control_lot_id, analyte_id)
);

create table if not exists public.iqc_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.iqc_runs(id),
  analyte_id uuid references public.iqc_analytes(id),
  related_consumable_id uuid references public.iqc_run_consumables(id),
  problem text not null check (nullif(trim(problem), '') is not null),
  root_cause text,
  action_taken text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.nipt_users(id),
  closed_at timestamptz
);

create index if not exists iqc_control_lots_material on public.iqc_control_lots(control_material_id);
create index if not exists iqc_control_specs_lot_analyte on public.iqc_control_specs(control_lot_id, analyte_id);
create index if not exists iqc_runs_datetime on public.iqc_runs(run_datetime desc);
create index if not exists iqc_run_consumables_run on public.iqc_run_consumables(run_id);
create index if not exists iqc_result_values_lot_analyte on public.iqc_result_values(control_lot_id, analyte_id);
create index if not exists iqc_result_values_run on public.iqc_result_values(run_id);
create index if not exists iqc_corrective_actions_run on public.iqc_corrective_actions(run_id);

alter table public.iqc_analytes enable row level security;
alter table public.iqc_instruments enable row level security;
alter table public.iqc_control_materials enable row level security;
alter table public.iqc_control_lots enable row level security;
alter table public.iqc_control_specs enable row level security;
alter table public.iqc_runs enable row level security;
alter table public.iqc_run_consumables enable row level security;
alter table public.iqc_result_values enable row level security;
alter table public.iqc_corrective_actions enable row level security;

drop policy if exists iqc_analytes_read on public.iqc_analytes;
create policy iqc_analytes_read on public.iqc_analytes for select using (public.current_bm_role() is not null);
drop policy if exists iqc_instruments_read on public.iqc_instruments;
create policy iqc_instruments_read on public.iqc_instruments for select using (public.current_bm_role() is not null);
drop policy if exists iqc_control_materials_read on public.iqc_control_materials;
create policy iqc_control_materials_read on public.iqc_control_materials for select using (public.current_bm_role() is not null);
drop policy if exists iqc_control_lots_read on public.iqc_control_lots;
create policy iqc_control_lots_read on public.iqc_control_lots for select using (public.current_bm_role() is not null);
drop policy if exists iqc_control_specs_read on public.iqc_control_specs;
create policy iqc_control_specs_read on public.iqc_control_specs for select using (public.current_bm_role() is not null);
drop policy if exists iqc_runs_read on public.iqc_runs;
create policy iqc_runs_read on public.iqc_runs for select using (public.current_bm_role() is not null);
drop policy if exists iqc_run_consumables_read on public.iqc_run_consumables;
create policy iqc_run_consumables_read on public.iqc_run_consumables for select using (public.current_bm_role() is not null);
drop policy if exists iqc_result_values_read on public.iqc_result_values;
create policy iqc_result_values_read on public.iqc_result_values for select using (public.current_bm_role() is not null);
drop policy if exists iqc_corrective_actions_read on public.iqc_corrective_actions;
create policy iqc_corrective_actions_read on public.iqc_corrective_actions for select using (public.current_bm_role() is not null);

-- ───────────────────────────────────────────────────────────
-- 202606190003_iqc_tea.sql
-- ───────────────────────────────────────────────────────────
-- Allowable Total Error (TEa) registry per analyte, used for Six Sigma metrics
-- and the Mean +/- TEa acceptance band in Measurement Uncertainty.
-- Defaults for viral load (log10): HIV/HCV/CMV 0.5, HBV 1.0.

create table if not exists public.iqc_tea_specs (
  id uuid primary key default gen_random_uuid(),
  analyte_id uuid not null references public.iqc_analytes(id),
  tea_value numeric not null check (tea_value > 0),
  tea_mode text not null default 'absolute' check (tea_mode in ('absolute', 'percent')),
  tea_unit text,
  source_ref text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iqc_tea_specs_analyte on public.iqc_tea_specs(analyte_id) where is_active;

alter table public.iqc_tea_specs enable row level security;
drop policy if exists iqc_tea_specs_read on public.iqc_tea_specs;
create policy iqc_tea_specs_read on public.iqc_tea_specs for select using (public.current_bm_role() is not null);

-- ───────────────────────────────────────────────────────────
-- 202606190004_iqc_uncertainty.sql
-- ───────────────────────────────────────────────────────────
-- Measurement Uncertainty (MU) budgets per QP-LAB-28 5.4 + Roche QCloud model.
-- A budget = one (analyte x measurand/level). Components are combined as the root
-- sum of squares of relative standard uncertainties (RSU): IQC (pooled across lots),
-- calibrator, EQAS, etc. UX = k * UC; reported as result +/- (result * UX).

create table if not exists public.iqc_uncertainty_budgets (
  id uuid primary key default gen_random_uuid(),
  analyte_id uuid not null references public.iqc_analytes(id),
  measurand text not null check (nullif(trim(measurand), '') is not null),
  concentration numeric not null check (concentration > 0),
  coverage_k numeric not null default 2 check (coverage_k > 0),
  combined_uc numeric,
  expanded_ux numeric,
  iqc_rsd numeric,
  iqc_n integer,
  iqc_lot_count integer,
  meets_requirement boolean not null default false,
  note text,
  evaluated_at timestamptz not null default now(),
  valid_until date,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.iqc_uncertainty_components (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.iqc_uncertainty_budgets(id) on delete cascade,
  source text not null check (source in ('iqc', 'calibrator', 'eqas', 'other')),
  type text not null default 'A' check (type in ('A', 'B')),
  label text,
  value numeric,
  distribution text not null default 'normal' check (distribution in ('normal', 'normal-k2', 'rectangular', 'triangular', 'u-shape')),
  divisor numeric,
  concentration numeric,
  su numeric,
  rsu numeric,
  created_at timestamptz not null default now()
);

create index if not exists iqc_uncertainty_budgets_analyte on public.iqc_uncertainty_budgets(analyte_id);
create index if not exists iqc_uncertainty_components_budget on public.iqc_uncertainty_components(budget_id);

alter table public.iqc_uncertainty_budgets enable row level security;
alter table public.iqc_uncertainty_components enable row level security;
drop policy if exists iqc_uncertainty_budgets_read on public.iqc_uncertainty_budgets;
create policy iqc_uncertainty_budgets_read on public.iqc_uncertainty_budgets for select using (public.current_bm_role() is not null);
drop policy if exists iqc_uncertainty_components_read on public.iqc_uncertainty_components;
create policy iqc_uncertainty_components_read on public.iqc_uncertainty_components for select using (public.current_bm_role() is not null);

-- ───────────────────────────────────────────────────────────
-- 202606190005_eqa.sql
-- ───────────────────────────────────────────────────────────
-- EQA (External Quality Assessment / proficiency testing). Files (certificates,
-- sample-receipt forms, annual summaries) use the shared bm_attachments table.

create table if not exists public.eqa_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.eqa_schemes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.eqa_providers(id),
  name text not null check (nullif(trim(name), '') is not null),
  code text,
  analyte_scope text,
  rounds_per_year integer check (rounds_per_year is null or rounds_per_year > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.eqa_rounds (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.eqa_schemes(id),
  round_label text not null check (nullif(trim(round_label), '') is not null),
  sample_received_date date,
  result_due_date date,
  submission_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'received', 'submitted', 'evaluated', 'closed')),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eqa_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.eqa_rounds(id) on delete cascade,
  analyte text not null check (nullif(trim(analyte), '') is not null),
  submitted_value text,
  evaluation_score numeric,
  outcome text not null default 'not-evaluated' check (outcome in ('acceptable', 'warning', 'unacceptable', 'not-evaluated')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.eqa_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.eqa_rounds(id),
  result_id uuid references public.eqa_results(id),
  problem text not null check (nullif(trim(problem), '') is not null),
  root_cause text,
  action_taken text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.nipt_users(id),
  closed_at timestamptz
);

create index if not exists eqa_schemes_provider on public.eqa_schemes(provider_id);
create index if not exists eqa_rounds_scheme on public.eqa_rounds(scheme_id);
create index if not exists eqa_rounds_due on public.eqa_rounds(result_due_date);
create index if not exists eqa_results_round on public.eqa_results(round_id);
create index if not exists eqa_corrective_actions_round on public.eqa_corrective_actions(round_id);

alter table public.eqa_providers enable row level security;
alter table public.eqa_schemes enable row level security;
alter table public.eqa_rounds enable row level security;
alter table public.eqa_results enable row level security;
alter table public.eqa_corrective_actions enable row level security;

drop policy if exists eqa_providers_read on public.eqa_providers;
create policy eqa_providers_read on public.eqa_providers for select using (public.current_bm_role() is not null);
drop policy if exists eqa_schemes_read on public.eqa_schemes;
create policy eqa_schemes_read on public.eqa_schemes for select using (public.current_bm_role() is not null);
drop policy if exists eqa_rounds_read on public.eqa_rounds;
create policy eqa_rounds_read on public.eqa_rounds for select using (public.current_bm_role() is not null);
drop policy if exists eqa_results_read on public.eqa_results;
create policy eqa_results_read on public.eqa_results for select using (public.current_bm_role() is not null);
drop policy if exists eqa_corrective_actions_read on public.eqa_corrective_actions;
create policy eqa_corrective_actions_read on public.eqa_corrective_actions for select using (public.current_bm_role() is not null);

commit;
