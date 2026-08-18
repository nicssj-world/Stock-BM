-- Optional external-lab accession number for HIV DRT checkouts.

alter table public.bm_hiv_drt_samples
  add column outlab_ln text
  check (outlab_ln is null or nullif(trim(outlab_ln), '') is not null);
