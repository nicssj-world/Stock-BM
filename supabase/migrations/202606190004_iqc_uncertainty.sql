-- Measurement Uncertainty (MU) budgets per QP-LAB-28 5.4 + Roche QCloud model.
-- A budget = one (analyte x measurand/level). Components are combined as the root
-- sum of squares of relative standard uncertainties (RSU): IQC (pooled across lots),
-- calibrator, EQAS, etc. UX = k * UC; reported as result +/- (result * UX).

create table public.iqc_uncertainty_budgets (
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

create table public.iqc_uncertainty_components (
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

create index iqc_uncertainty_budgets_analyte on public.iqc_uncertainty_budgets(analyte_id);
create index iqc_uncertainty_components_budget on public.iqc_uncertainty_components(budget_id);

alter table public.iqc_uncertainty_budgets enable row level security;
alter table public.iqc_uncertainty_components enable row level security;
create policy iqc_uncertainty_budgets_read on public.iqc_uncertainty_budgets for select using (public.current_bm_role() is not null);
create policy iqc_uncertainty_components_read on public.iqc_uncertainty_components for select using (public.current_bm_role() is not null);
