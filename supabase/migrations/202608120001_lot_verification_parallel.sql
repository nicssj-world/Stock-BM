-- Parallel comparison data for quantitative reagent-lot verification.
-- Raw run values stay in the unit entered by the operator (copies/mL for VL),
-- while the server snapshots the IQC control statistics and stores derived
-- values in the analyte's calculation scale (linear or log10).

alter table public.lotverif_verifications
  add column if not exists parallel_analyte_id uuid references public.iqc_analytes(id),
  add column if not exists parallel_scale text check (parallel_scale is null or parallel_scale in ('linear', 'log10')),
  add column if not exists parallel_unit text,
  add column if not exists parallel_limit numeric default 1 check (parallel_limit is null or parallel_limit > 0);

create table if not exists public.lotverif_parallel_rows (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.lotverif_verifications(id) on delete cascade,
  level_no smallint not null check (level_no between 1 and 3),
  control_lot_id uuid references public.iqc_control_lots(id),
  control_label text,
  control_mean numeric,
  control_sd numeric check (control_sd is null or control_sd >= 0),
  stats_source text not null default 'manual' check (stats_source in ('assigned', 'lab', 'manual')),
  old_run_1 numeric,
  old_run_2 numeric,
  new_run_1 numeric,
  new_run_2 numeric,
  current_mean numeric,
  new_mean numeric,
  difference numeric,
  percent_diff numeric,
  cv_percent numeric,
  created_at timestamptz not null default now(),
  unique (verification_id, level_no)
);

create index if not exists lotverif_parallel_rows_verification on public.lotverif_parallel_rows(verification_id, level_no);

alter table public.lotverif_parallel_rows enable row level security;
create policy lotverif_parallel_rows_read on public.lotverif_parallel_rows
  for select using (public.current_bm_role() is not null);
