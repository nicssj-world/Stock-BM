-- Allow the new quality modules to attach files via the shared bm_attachments table:
--   env      = Temperature / Environment monitoring
--   lotverif = Lot-to-lot verification (reagent / control lot acceptance)

alter table public.bm_attachments drop constraint bm_attachments_module_check;
alter table public.bm_attachments
  add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif'));
