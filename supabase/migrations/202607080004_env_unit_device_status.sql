-- Device identity, calibration due date, and temporary downtime status
-- for temperature monitored units.

alter table public.env_monitored_units
  add column if not exists thermometer_id text,
  add column if not exists datalogger_id text,
  add column if not exists calibration_due_date date,
  add column if not exists availability_status text not null default 'active',
  add column if not exists unavailable_from date,
  add column if not exists unavailable_until date,
  add column if not exists unavailable_note text;

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_availability_status_check;

alter table public.env_monitored_units
  add constraint env_monitored_units_availability_status_check
  check (availability_status in ('active', 'maintenance', 'paused'));

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_unavailable_range_check;

alter table public.env_monitored_units
  add constraint env_monitored_units_unavailable_range_check
  check (unavailable_from is null or unavailable_until is null or unavailable_from <= unavailable_until);

create index if not exists env_monitored_units_calibration_due
  on public.env_monitored_units(calibration_due_date);

create index if not exists env_monitored_units_availability
  on public.env_monitored_units(availability_status, unavailable_from, unavailable_until);
