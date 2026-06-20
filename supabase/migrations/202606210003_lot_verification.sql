-- Lot-to-lot verification (reagent / control lot acceptance). When a new reagent or
-- IQC control lot arrives it must be verified against the current lot before use
-- (ISO 15189). One table spans both subjects via nullable FKs to bm_stock_lots and
-- iqc_control_lots, bridging Stock and IQC. Writes via service-role only.

create table public.lotverif_verifications (
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
create table public.lotverif_measurements (
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

create index lotverif_verifications_status on public.lotverif_verifications(status);
create index lotverif_verifications_created_at on public.lotverif_verifications(created_at desc);
create index lotverif_measurements_verification on public.lotverif_measurements(verification_id);

alter table public.lotverif_verifications enable row level security;
alter table public.lotverif_measurements enable row level security;

create policy lotverif_verifications_read on public.lotverif_verifications for select using (public.current_bm_role() is not null);
create policy lotverif_measurements_read on public.lotverif_measurements for select using (public.current_bm_role() is not null);
