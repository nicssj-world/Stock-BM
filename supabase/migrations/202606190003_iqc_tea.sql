-- Allowable Total Error (TEa) registry per analyte, used for Six Sigma metrics
-- and the Mean +/- TEa acceptance band in Measurement Uncertainty.
-- Defaults for viral load (log10): HIV/HCV/CMV 0.5, HBV 1.0.

create table public.iqc_tea_specs (
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

create index iqc_tea_specs_analyte on public.iqc_tea_specs(analyte_id) where is_active;

alter table public.iqc_tea_specs enable row level security;
create policy iqc_tea_specs_read on public.iqc_tea_specs for select using (public.current_bm_role() is not null);
