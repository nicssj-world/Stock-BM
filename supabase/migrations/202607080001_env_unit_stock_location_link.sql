-- Ensure temperature monitored units can be linked to Stock locations.

alter table public.env_monitored_units
  add column if not exists location_id uuid references public.bm_stock_locations(id);

create index if not exists env_monitored_units_location_id
  on public.env_monitored_units(location_id);
