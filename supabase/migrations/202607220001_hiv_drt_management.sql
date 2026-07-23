-- HIV DRT: 8x12 tube racks, genotyping checkout/result TAT,
-- and per-tube destruction tracking.

create table public.bm_hiv_drt_racks (
  id uuid primary key default gen_random_uuid(),
  rack_code text not null unique check (nullif(trim(rack_code), '') is not null),
  rows integer not null default 8 check (rows = 8),
  columns integer not null default 12 check (columns = 12),
  capacity integer not null default 96 check (capacity = 96),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bm_hiv_drt_samples (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique check (nullif(trim(barcode), '') is not null),
  status text not null check (status in ('stored', 'checked_out', 'result_received', 'destroyed')),
  from_storage boolean not null default true,
  current_rack_id uuid references public.bm_hiv_drt_racks(id),
  current_position integer check (current_position between 1 and 96),
  stored_rack_code text,
  stored_position integer check (stored_position between 1 and 96),
  stored_at timestamptz,
  stored_by uuid references public.nipt_users(id),
  destroy_due_on date,
  checked_out_at timestamptz,
  checked_out_by uuid references public.nipt_users(id),
  checkout_destination text,
  tat_due_on date,
  result_received_at timestamptz,
  result_received_by uuid references public.nipt_users(id),
  destroyed_at timestamptz,
  destroyed_by uuid references public.nipt_users(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'stored') = (current_rack_id is not null and current_position is not null)),
  check (not from_storage or (stored_at is not null and stored_by is not null and stored_rack_code is not null and stored_position is not null and destroy_due_on is not null)),
  check (status = 'stored' or status = 'destroyed' or (checked_out_at is not null and checked_out_by is not null and nullif(trim(checkout_destination), '') is not null and tat_due_on is not null)),
  check ((status = 'result_received') = (result_received_at is not null and result_received_by is not null)),
  check ((status = 'destroyed') = (destroyed_at is not null and destroyed_by is not null))
);

alter table public.bm_hiv_drt_samples
  add constraint bm_hiv_drt_samples_active_position
  unique (current_rack_id, current_position) deferrable initially immediate;
create index bm_hiv_drt_samples_status on public.bm_hiv_drt_samples(status, created_at desc);
create index bm_hiv_drt_samples_tat_due on public.bm_hiv_drt_samples(tat_due_on) where status = 'checked_out';
create index bm_hiv_drt_samples_destroy_due on public.bm_hiv_drt_samples(destroy_due_on) where status = 'stored';

alter table public.bm_hiv_drt_racks enable row level security;
alter table public.bm_hiv_drt_samples enable row level security;

create policy bm_hiv_drt_racks_staff_read on public.bm_hiv_drt_racks
for select using (public.current_bm_role() in ('Admin', 'Staff'));

create policy bm_hiv_drt_samples_staff_read on public.bm_hiv_drt_samples
for select using (public.current_bm_role() in ('Admin', 'Staff'));

create or replace function public.move_hiv_drt_sample_position(
  p_sample_id uuid,
  p_target_position integer,
  p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_rack_id uuid;
  v_from_position integer;
  v_target_id uuid;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role not in ('Admin', 'Staff') then raise exception 'HIV DRT Staff permission required'; end if;
  if p_target_position not between 1 and 96 then raise exception 'Rack position must be between 1 and 96'; end if;

  select current_rack_id, current_position into v_rack_id, v_from_position
  from public.bm_hiv_drt_samples
  where id = p_sample_id and status = 'stored'
  for update;
  if not found then raise exception 'Tube not found or not stored'; end if;
  if v_from_position = p_target_position then return; end if;

  select id into v_target_id
  from public.bm_hiv_drt_samples
  where current_rack_id = v_rack_id and current_position = p_target_position and status = 'stored'
  for update;

  set constraints public.bm_hiv_drt_samples_active_position deferred;

  if v_target_id is null then
    update public.bm_hiv_drt_samples
      set current_position = p_target_position, stored_position = p_target_position, updated_at = now()
      where id = p_sample_id;
  else
    update public.bm_hiv_drt_samples
      set current_position = p_target_position, stored_position = p_target_position, updated_at = now()
      where id = p_sample_id;
    update public.bm_hiv_drt_samples
      set current_position = v_from_position, stored_position = v_from_position, updated_at = now()
      where id = v_target_id;
  end if;
end;
$$;

revoke all on function public.move_hiv_drt_sample_position(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.move_hiv_drt_sample_position(uuid, integer, uuid) to service_role;
