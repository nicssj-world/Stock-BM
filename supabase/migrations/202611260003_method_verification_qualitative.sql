-- Method verification: qualitative agreement section (CLSI EP12-A2) for assays that
-- report categories instead of numbers (e.g. HPV genotyping: HPV16+ / HPV18+ /
-- Other HR+ / Negative). Agreement pairs and reproducibility replicates are stored
-- as entered in JSONB; statistics are computed on read.
-- Idempotent: safe to re-run in the Supabase SQL Editor.

alter table public.methodverif_studies
  add column if not exists qualitative_data jsonb not null default '{}'::jsonb;

alter table public.methodverif_studies
  drop constraint if exists methodverif_studies_required_sections_check;
alter table public.methodverif_studies
  add constraint methodverif_studies_required_sections_check
  check (
    required_sections <@ array['precision', 'lod', 'linearity', 'comparison', 'qualitative']
    and cardinality(required_sections) > 0
  );

notify pgrst, 'reload schema';
