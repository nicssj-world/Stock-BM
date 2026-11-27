-- Team calendar: types whose entries belong to the lab rather than a person
-- (e.g. "OT NIPT 2 ทุ่ม"). Such entries have no user_id; the calendar shows the
-- type name (and the title when the type asks for one) instead of a name.

alter table public.bm_calendar_types
  add column if not exists requires_user boolean not null default true;

alter table public.bm_calendar_events
  alter column user_id drop not null;

notify pgrst, 'reload schema';
