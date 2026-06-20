-- ============================================================
-- Molecular-CBH QMS — Temperature + Lot-to-lot migration bundle (IDEMPOTENT)
-- Apply in Supabase Dashboard > SQL Editor (shared project with Genomic-CBH)
-- Safe to re-run: if-not-exists + drop-if-exists. One transaction (all-or-nothing).
-- Combines migrations 202606210001..0003. Generated 2026-06-21.
-- ============================================================

begin;

-- ───────────────────────────────────────────────────────────
-- 202606210001_bm_attachments_modules.sql
-- ───────────────────────────────────────────────────────────
-- Allow the new quality modules to attach files via the shared bm_attachments table:
--   env      = Temperature / Environment monitoring
--   lotverif = Lot-to-lot verification (reagent / control lot acceptance)

alter table public.bm_attachments drop constraint if exists bm_attachments_module_check;
alter table public.bm_attachments
  add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif'));

-- ───────────────────────────────────────────────────────────
-- 202606210002_env_monitoring.sql
-- ───────────────────────────────────────────────────────────
-- Temperature / Environment monitoring. Daily readings for fridges/freezers/rooms,
-- bound (optionally) to a stock storage location so cold-chain QC sits next to the
-- reagents Stock already tracks. Each unit carries min/max limits + a QR token; a
-- sticker on the unit deep-links to /environment/u/<token> for fast mobile entry.
-- Reuses nipt_users + current_bm_role() for auth; writes via service-role only.

create table if not exists public.env_monitored_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  kind text not null default 'fridge' check (kind in ('fridge', 'freezer', 'room', 'incubator', 'other')),
  location_id uuid references public.bm_stock_locations(id),
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  min_limit numeric,
  max_limit numeric,
  unit text not null default '°C',
  readings_per_day integer not null default 1 check (readings_per_day > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_limit is null or max_limit is null or min_limit <= max_limit)
);

-- One reading per unit per day (once-daily). status is computed server-side against
-- the unit's min/max limits; recorded_min/max are optional min-max thermometer values.
create table if not exists public.env_readings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.env_monitored_units(id) on delete cascade,
  reading_date date not null,
  reading_value numeric not null,
  recorded_min numeric,
  recorded_max numeric,
  status text not null default 'in-range' check (status in ('in-range', 'out-of-range', 'corrected')),
  is_voided boolean not null default false,
  void_reason text,
  note text,
  recorded_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (unit_id, reading_date)
);

-- Corrective action for an out-of-range reading (mirrors iqc_corrective_actions).
-- Files (e.g. evidence) attach through bm_attachments with module = 'env'.
create table if not exists public.env_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.env_readings(id) on delete cascade,
  problem text not null check (nullif(trim(problem), '') is not null),
  root_cause text,
  action_taken text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.nipt_users(id),
  closed_at timestamptz
);

create index if not exists env_readings_unit_date on public.env_readings(unit_id, reading_date desc);
create index if not exists env_corrective_actions_reading on public.env_corrective_actions(reading_id);

alter table public.env_monitored_units enable row level security;
alter table public.env_readings enable row level security;
alter table public.env_corrective_actions enable row level security;

drop policy if exists env_monitored_units_read on public.env_monitored_units;
create policy env_monitored_units_read on public.env_monitored_units for select using (public.current_bm_role() is not null);
drop policy if exists env_readings_read on public.env_readings;
create policy env_readings_read on public.env_readings for select using (public.current_bm_role() is not null);
drop policy if exists env_corrective_actions_read on public.env_corrective_actions;
create policy env_corrective_actions_read on public.env_corrective_actions for select using (public.current_bm_role() is not null);

-- ───────────────────────────────────────────────────────────
-- 202606210003_lot_verification.sql
-- ───────────────────────────────────────────────────────────
-- Lot-to-lot verification (reagent / control lot acceptance). When a new reagent or
-- IQC control lot arrives it must be verified against the current lot before use
-- (ISO 15189). One table spans both subjects via nullable FKs to bm_stock_lots and
-- iqc_control_lots, bridging Stock and IQC. Writes via service-role only.

create table if not exists public.lotverif_verifications (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('reagent-lot', 'control-lot')),
  title text,
  new_stock_lot_id uuid references public.bm_stock_lots(id),
  old_stock_lot_id uuid references public.bm_stock_lots(id),
  new_control_lot_id uuid references public.iqc_control_lots(id),
  old_control_lot_id uuid references public.iqc_control_lots(id),
  method text not null default 'parallel-comparison' check (method in ('parallel-comparison', 'qc-acceptance', 'patient-comparison')),
  acceptance_criteria text,
  status text not null default 'draft' check (status in ('draft', 'in-progress', 'passed', 'failed', 'released', 'rejected')),
  conclusion text,
  performed_by uuid references public.nipt_users(id),
  reviewed_by uuid references public.nipt_users(id),
  reviewed_at timestamptz,
  released_by uuid references public.nipt_users(id),
  released_at timestamptz,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One comparison data point: old vs new lot for an analyte/sample. difference,
-- percent_diff, within_criteria (quantitative) or concordant (qualitative) are
-- computed server-side. analyte_id links IQC analytes when relevant; analyte_label
-- is a free-text fallback for reagents not modelled as IQC analytes.
create table if not exists public.lotverif_measurements (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.lotverif_verifications(id) on delete cascade,
  analyte_id uuid references public.iqc_analytes(id),
  analyte_label text,
  sample_label text,
  old_value numeric,
  new_value numeric,
  difference numeric,
  percent_diff numeric,
  within_criteria boolean,
  old_qualitative text,
  new_qualitative text,
  concordant boolean,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lotverif_verifications_status on public.lotverif_verifications(status);
create index if not exists lotverif_verifications_created_at on public.lotverif_verifications(created_at desc);
create index if not exists lotverif_measurements_verification on public.lotverif_measurements(verification_id);

alter table public.lotverif_verifications enable row level security;
alter table public.lotverif_measurements enable row level security;

drop policy if exists lotverif_verifications_read on public.lotverif_verifications;
create policy lotverif_verifications_read on public.lotverif_verifications for select using (public.current_bm_role() is not null);
drop policy if exists lotverif_measurements_read on public.lotverif_measurements;
create policy lotverif_measurements_read on public.lotverif_measurements for select using (public.current_bm_role() is not null);

commit;
