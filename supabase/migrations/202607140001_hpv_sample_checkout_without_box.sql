-- Allow checking out an HPV sample barcode that was never stored in a storage box
-- (e.g. sample sent straight to co-testing). box_id/position become optional and
-- from_storage_box marks whether the checkout record originated from a storage box.

alter table public.bm_hpv_samples
  alter column box_id drop not null,
  alter column position drop not null,
  add column from_storage_box boolean not null default true;

comment on column public.bm_hpv_samples.from_storage_box is
  'False when this row was created directly at checkout time because the barcode was never stored in a storage box.';
