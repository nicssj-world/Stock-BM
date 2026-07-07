-- Allow HPV Management distribution documents to use the shared attachment table
-- and the existing private bm-quality Storage bucket.

alter table public.bm_attachments drop constraint if exists bm_attachments_module_check;
alter table public.bm_attachments
  add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif', 'hpv'));
