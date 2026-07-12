-- Store collection method on each HPV sample instead of on its storage box.
-- The deployment currently has no storage boxes or samples, so no backfill is needed.

drop index if exists public.bm_hpv_storage_boxes_status_type;

alter table public.bm_hpv_storage_boxes
  drop column if exists box_type;

alter table public.bm_hpv_samples
  add column specimen_type text not null check (specimen_type in ('self_collected', 'clinician_collected'));

create index bm_hpv_samples_specimen_type on public.bm_hpv_samples(specimen_type, stored_at desc);

notify pgrst, 'reload schema';
