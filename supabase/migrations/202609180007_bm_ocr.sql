-- Client-side OCR audit records. Invoice images never enter these tables;
-- OCR stores only the reviewed text and draft suggestions.

create table if not exists public.bm_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  workflow text not null default 'invoice' check (workflow in ('invoice')),
  status text not null default 'completed' check (status in ('completed', 'failed', 'cancelled')),
  engine text not null check (nullif(trim(engine), '') is not null),
  engine_version text,
  languages text not null default 'tha+eng',
  raw_text text not null,
  confidence numeric,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.bm_ocr_candidates (
  id uuid primary key default gen_random_uuid(),
  ocr_job_id uuid not null references public.bm_ocr_jobs(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  source_text text,
  catalog_no_text text,
  lot_text text,
  expiry_text text,
  expected_qty numeric(14,3) not null default 1 check (expected_qty > 0),
  stock_item_id uuid,
  match_method text check (match_method is null or match_method in ('exact_unique', 'exact_ambiguous', 'similar', 'manual', 'unmatched')),
  match_confidence numeric,
  candidate_item_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_item_ids) = 'array'),
  created_at timestamptz not null default now(),
  unique (ocr_job_id, line_no)
);

create index if not exists bm_ocr_candidates_job on public.bm_ocr_candidates(ocr_job_id, line_no);

alter table public.bm_ocr_jobs enable row level security;
create policy bm_ocr_jobs_active_read on public.bm_ocr_jobs
for select using (public.current_bm_role() is not null);

alter table public.bm_ocr_candidates enable row level security;
create policy bm_ocr_candidates_active_read on public.bm_ocr_candidates
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_ocr_jobs from public, anon, authenticated;
grant all on table public.bm_ocr_jobs to service_role;
revoke all on table public.bm_ocr_candidates from public, anon, authenticated;
grant all on table public.bm_ocr_candidates to service_role;

notify pgrst, 'reload schema';
