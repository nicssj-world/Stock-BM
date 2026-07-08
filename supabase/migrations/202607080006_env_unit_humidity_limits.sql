-- Optional relative humidity monitoring per environmental unit.

alter table public.env_monitored_units
  add column if not exists track_humidity boolean not null default false,
  add column if not exists humidity_min_limit numeric,
  add column if not exists humidity_max_limit numeric;

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_humidity_limits_check;

alter table public.env_monitored_units
  add constraint env_monitored_units_humidity_limits_check
  check (
    (humidity_min_limit is null or (humidity_min_limit >= 0 and humidity_min_limit <= 100))
    and (humidity_max_limit is null or (humidity_max_limit >= 0 and humidity_max_limit <= 100))
    and (
      humidity_min_limit is null
      or humidity_max_limit is null
      or humidity_min_limit <= humidity_max_limit
    )
  );
