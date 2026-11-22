-- Instrument comparison (method comparison) — ISO 15189:2022 7.3.2 / 7.3.7.4.
-- When a new analyzer replaces or runs alongside an existing one (e.g. cobas 8800 →
-- cobas 6800), the same patient samples are measured on both and the bias is checked
-- against the lab's acceptance criteria (CLSI EP09). Raw results are stored exactly as
-- reported ("1.2E+05", "<20", "Target Not Detected"); statistics are computed on read.
-- Evidence files attach through bm_attachments with module = 'instcomp'.
-- Idempotent: safe to re-run in the Supabase SQL Editor.

create table if not exists public.instcomp_studies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (nullif(trim(title), '') is not null),
  test_name text not null check (nullif(trim(test_name), '') is not null),
  analyte_id uuid references public.iqc_analytes(id),
  scale text not null default 'log10' check (scale in ('linear', 'log10')),
  unit text,
  reference_instrument_id uuid references public.iqc_instruments(id),
  reference_label text,
  candidate_instrument_id uuid references public.iqc_instruments(id),
  candidate_label text,
  bias_limit numeric not null default 0.3 check (bias_limit > 0),
  pair_limit numeric not null default 0.5 check (pair_limit > 0),
  min_pairs integer not null default 20 check (min_pairs >= 2),
  status text not null default 'draft' check (status in ('draft', 'in-progress', 'passed', 'failed', 'approved', 'rejected')),
  conclusion text,
  performed_on date,
  created_by uuid not null references public.nipt_users(id),
  reviewed_by uuid references public.nipt_users(id),
  reviewed_at timestamptz,
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reference_instrument_id is not null or nullif(trim(reference_label), '') is not null),
  check (candidate_instrument_id is not null or nullif(trim(candidate_label), '') is not null)
);

create table if not exists public.instcomp_samples (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.instcomp_studies(id) on delete cascade,
  row_no integer not null check (row_no > 0),
  sample_label text,
  reference_raw text,
  candidate_raw text,
  note text,
  created_at timestamptz not null default now(),
  unique (study_id, row_no)
);

create index if not exists instcomp_studies_created_at on public.instcomp_studies(created_at desc);
create index if not exists instcomp_samples_study on public.instcomp_samples(study_id, row_no);

alter table public.instcomp_studies enable row level security;
alter table public.instcomp_samples enable row level security;

drop policy if exists instcomp_studies_read on public.instcomp_studies;
create policy instcomp_studies_read on public.instcomp_studies
  for select using (public.current_bm_role() is not null);
drop policy if exists instcomp_samples_read on public.instcomp_samples;
create policy instcomp_samples_read on public.instcomp_samples
  for select using (public.current_bm_role() is not null);

alter table public.bm_attachments drop constraint if exists bm_attachments_module_check;
alter table public.bm_attachments
  add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif', 'hpv', 'equipment', 'instcomp'));
