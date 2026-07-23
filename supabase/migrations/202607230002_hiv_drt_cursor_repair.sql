-- Repair rack cursors for tubes that existed before the forward-only cursor was added.

-- Keep this repair migration standalone-safe in case the cursor migration was
-- not applied separately through the Supabase SQL editor.
alter table public.bm_hiv_drt_racks
  add column if not exists next_position integer not null default 1
  check (next_position between 1 and 97);

with rack_history as (
  select
    rack.id,
    least(
      97,
      greatest(
        rack.next_position,
        coalesce(max(coalesce(sample.stored_position, sample.current_position)) + 1, 1)
      )
    )::integer as next_position
  from public.bm_hiv_drt_racks rack
  left join public.bm_hiv_drt_samples sample
    on sample.current_rack_id = rack.id
    or sample.stored_rack_code = rack.rack_code
  group by rack.id, rack.next_position
)
update public.bm_hiv_drt_racks rack
set next_position = history.next_position,
    updated_at = now()
from rack_history history
where history.id = rack.id
  and rack.next_position is distinct from history.next_position;
