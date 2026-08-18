-- A tube can be deleted from the HIV DRT workspace in any lifecycle state.
-- Remove its linked HIV LAB Alert automatically so the foreign key does not
-- block the tube deletion or leave an orphaned alert behind.

alter table public.bm_hiv_lab_alerts
  drop constraint if exists bm_hiv_lab_alerts_hiv_drt_sample_id_fkey;

alter table public.bm_hiv_lab_alerts
  add constraint bm_hiv_lab_alerts_hiv_drt_sample_id_fkey
  foreign key (hiv_drt_sample_id)
  references public.bm_hiv_drt_samples(id)
  on delete cascade;
