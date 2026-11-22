-- Method verification (ISO 15189:2022 7.3.2) — one record per test × instrument that
-- bundles the verification studies required before a commercial method is used:
-- precision (CLSI EP15-A3), limit of detection (EP17-A2), linearity (EP06) and a link
-- to the method comparison (EP09) kept in instcomp_studies. Raw results are stored
-- as entered in JSONB per study section; statistics are computed on read.
-- Evidence files attach through bm_attachments with module = 'methodverif'.
-- Idempotent: safe to re-run in the Supabase SQL Editor.

create table if not exists public.methodverif_studies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (nullif(trim(title), '') is not null),
  test_name text not null check (nullif(trim(test_name), '') is not null),
  analyte_id uuid references public.iqc_analytes(id),
  instrument_id uuid not null references public.iqc_instruments(id),
  scale text not null default 'log10' check (scale in ('linear', 'log10')),
  unit text,
  required_sections text[] not null default array['precision', 'lod', 'linearity', 'comparison']
    check (required_sections <@ array['precision', 'lod', 'linearity', 'comparison'] and cardinality(required_sections) > 0),
  precision_data jsonb not null default '{}'::jsonb,
  lod_data jsonb not null default '{}'::jsonb,
  linearity_data jsonb not null default '{}'::jsonb,
  instcomp_study_id uuid references public.instcomp_studies(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'in-progress', 'passed', 'failed', 'approved', 'rejected')),
  conclusion text,
  started_on date,
  created_by uuid not null references public.nipt_users(id),
  reviewed_by uuid references public.nipt_users(id),
  reviewed_at timestamptz,
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists methodverif_studies_created_at on public.methodverif_studies(created_at desc);
create index if not exists methodverif_studies_instrument on public.methodverif_studies(instrument_id);

alter table public.methodverif_studies enable row level security;
drop policy if exists methodverif_studies_read on public.methodverif_studies;
create policy methodverif_studies_read on public.methodverif_studies
  for select using (public.current_bm_role() is not null);

alter table public.bm_attachments drop constraint if exists bm_attachments_module_check;
alter table public.bm_attachments
  add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif', 'hpv', 'equipment', 'instcomp', 'methodverif'));
