-- A dash in the registry UI means the Asset No. was not assigned.  It is not
-- an identifier and must not reserve the unique value "-" for one machine.
update public.bm_equipment
set asset_number = null
where trim(coalesce(asset_number, '')) = '-';

drop index if exists public.bm_equipment_asset_unique;

create unique index bm_equipment_asset_unique
  on public.bm_equipment(lower(asset_number))
  where asset_number is not null
    and trim(asset_number) <> ''
    and trim(asset_number) <> '-';
