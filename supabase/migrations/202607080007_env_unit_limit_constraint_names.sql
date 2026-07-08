-- Rename anonymous environmental unit checks so database errors are readable.
-- Also keeps support for negative freezer temperature limits; only ordering matters.

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_check;

alter table public.env_monitored_units
  drop constraint if exists env_monitored_units_temperature_limits_check;

alter table public.env_monitored_units
  add constraint env_monitored_units_temperature_limits_check
  check (min_limit is null or max_limit is null or min_limit <= max_limit);
