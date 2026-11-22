-- Method verification: keep the method comparison (CLSI EP09) inside the verification
-- record instead of a separate Method comparison module. Paired results and criteria
-- are stored as entered in JSONB; statistics are computed on read.
-- Idempotent: safe to re-run in the Supabase SQL Editor.

alter table public.methodverif_studies
  add column if not exists comparison_data jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
