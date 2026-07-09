-- Ensure HPV site self-supplied flag exists and refresh the PostgREST schema cache.
-- Some deployed databases missed the older migration or still had stale schema cache.

alter table public.bm_hpv_sites
  add column if not exists self_supplied boolean not null default false;

notify pgrst, 'reload schema';
