-- Link equipment locations to the same location registry used by reagent stock.
alter table public.bm_equipment
  add column location_id uuid references public.bm_stock_locations(id) on delete set null;

create index bm_equipment_location_id
  on public.bm_equipment(location_id)
  where location_id is not null;

-- Preserve free-text locations and link legacy values when they match a stock
-- location code/name. Unmatched text remains available as a fallback.
update public.bm_equipment as equipment
set location_id = (
  select location.id
  from public.bm_stock_locations as location
  where lower(trim(equipment.location)) in (
    lower(trim(location.code)),
    lower(trim(location.name)),
    lower(trim(location.code || ' · ' || location.name))
  )
  order by
    case when lower(trim(equipment.location)) = lower(trim(location.code)) then 0 else 1 end,
    location.code
  limit 1
)
where equipment.location_id is null
  and nullif(trim(equipment.location), '') is not null;
