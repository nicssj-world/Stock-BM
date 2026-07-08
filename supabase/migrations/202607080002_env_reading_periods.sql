-- Allow each temperature unit to require 1-3 readings per day by shift/period.

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_readings_per_day_check;

alter table public.env_monitored_units
  add constraint env_monitored_units_readings_per_day_check
  check (readings_per_day between 1 and 3);

alter table public.env_readings
  add column if not exists period_index integer not null default 1;

alter table public.env_readings
  drop constraint if exists env_readings_period_index_check;

alter table public.env_readings
  add constraint env_readings_period_index_check
  check (period_index between 1 and 3);

alter table public.env_readings
  drop constraint if exists env_readings_unit_id_reading_date_key;

alter table public.env_readings
  drop constraint if exists env_readings_unit_id_reading_date_period_index_key;

alter table public.env_readings
  add constraint env_readings_unit_id_reading_date_period_index_key
  unique (unit_id, reading_date, period_index);

create index if not exists env_readings_unit_date_period
  on public.env_readings(unit_id, reading_date desc, period_index);
