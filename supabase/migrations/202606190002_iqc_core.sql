-- IQC core (Internal Quality Control). Supports both linear (e.g. CD4 flow) and
-- log10 (viral load) analytes. Runs in the same Supabase project as the stock
-- module; reuses nipt_users + current_bm_role() for auth, RLS read for any active
-- BM role, writes via service-role admin client only (no security-definer RPC).

create table public.iqc_analytes (
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

create table public.iqc_instruments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  model text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.iqc_control_materials (
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

create table public.iqc_control_lots (
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
create table public.iqc_control_specs (
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

create table public.iqc_runs (
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
create table public.iqc_run_consumables (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.iqc_runs(id) on delete cascade,
  kind text not null check (kind in ('staining-reagent', 'trucount-tube', 'mastermix', 'reagent', 'other')),
  lot_number text not null check (nullif(trim(lot_number), '') is not null),
  stock_lot_id uuid references public.bm_stock_lots(id),
  applies_scope text not null default 'all' check (applies_scope in ('all', 'absolute-only')),
  bead_count_per_tube numeric check (bead_count_per_tube is null or bead_count_per_tube > 0),
  created_at timestamptz not null default now()
);

create table public.iqc_result_values (
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

create table public.iqc_corrective_actions (
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

create index iqc_control_lots_material on public.iqc_control_lots(control_material_id);
create index iqc_control_specs_lot_analyte on public.iqc_control_specs(control_lot_id, analyte_id);
create index iqc_runs_datetime on public.iqc_runs(run_datetime desc);
create index iqc_run_consumables_run on public.iqc_run_consumables(run_id);
create index iqc_result_values_lot_analyte on public.iqc_result_values(control_lot_id, analyte_id);
create index iqc_result_values_run on public.iqc_result_values(run_id);
create index iqc_corrective_actions_run on public.iqc_corrective_actions(run_id);

alter table public.iqc_analytes enable row level security;
alter table public.iqc_instruments enable row level security;
alter table public.iqc_control_materials enable row level security;
alter table public.iqc_control_lots enable row level security;
alter table public.iqc_control_specs enable row level security;
alter table public.iqc_runs enable row level security;
alter table public.iqc_run_consumables enable row level security;
alter table public.iqc_result_values enable row level security;
alter table public.iqc_corrective_actions enable row level security;

create policy iqc_analytes_read on public.iqc_analytes for select using (public.current_bm_role() is not null);
create policy iqc_instruments_read on public.iqc_instruments for select using (public.current_bm_role() is not null);
create policy iqc_control_materials_read on public.iqc_control_materials for select using (public.current_bm_role() is not null);
create policy iqc_control_lots_read on public.iqc_control_lots for select using (public.current_bm_role() is not null);
create policy iqc_control_specs_read on public.iqc_control_specs for select using (public.current_bm_role() is not null);
create policy iqc_runs_read on public.iqc_runs for select using (public.current_bm_role() is not null);
create policy iqc_run_consumables_read on public.iqc_run_consumables for select using (public.current_bm_role() is not null);
create policy iqc_result_values_read on public.iqc_result_values for select using (public.current_bm_role() is not null);
create policy iqc_corrective_actions_read on public.iqc_corrective_actions for select using (public.current_bm_role() is not null);
