-- Track relative humidity alongside each temperature reading.

alter table public.env_readings
  add column if not exists humidity_percent numeric;

alter table public.env_readings
  drop constraint if exists env_readings_humidity_percent_check;

alter table public.env_readings
  add constraint env_readings_humidity_percent_check
  check (humidity_percent is null or (humidity_percent >= 0 and humidity_percent <= 100));
