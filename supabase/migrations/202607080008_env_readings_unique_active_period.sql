-- Allow re-logging a unit/date/period after the previous reading was voided.
-- The old unique constraint also counted voided rows, causing "Already logged"
-- even when the visible active reading had been voided.

alter table public.env_readings
  drop constraint if exists env_readings_unit_id_reading_date_key;

alter table public.env_readings
  drop constraint if exists env_readings_unit_id_reading_date_period_index_key;

drop index if exists public.env_readings_active_unit_date_period_unique;

create unique index env_readings_active_unit_date_period_unique
  on public.env_readings(unit_id, reading_date, period_index)
  where is_voided = false;

notify pgrst, 'reload schema';
