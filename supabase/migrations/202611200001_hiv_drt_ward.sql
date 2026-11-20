-- Optional requesting ward for HIV DRT checkouts.

alter table public.bm_hiv_drt_samples
  add column if not exists ward text
  check (ward is null or nullif(trim(ward), '') is not null);
