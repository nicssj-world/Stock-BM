-- Keep HIV DRT auto-fill moving forward. Vacated positions remain manual choices.

alter table public.bm_hiv_drt_racks
  add column if not exists next_position integer not null default 1
  check (next_position between 1 and 97);

with rack_history as (
  select rack.id, least(97, coalesce(max(sample.stored_position) + 1, 1))::integer as next_position
  from public.bm_hiv_drt_racks rack
  left join public.bm_hiv_drt_samples sample on sample.stored_rack_code = rack.rack_code
  group by rack.id
)
update public.bm_hiv_drt_racks rack
set next_position = history.next_position
from rack_history history
where history.id = rack.id;
