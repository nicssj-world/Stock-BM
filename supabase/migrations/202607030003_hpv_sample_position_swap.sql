-- Allow atomic position swaps by making the unique constraint deferrable
alter table public.bm_hpv_samples drop constraint bm_hpv_samples_box_id_position_key;

alter table public.bm_hpv_samples
  add constraint bm_hpv_samples_box_id_position_key
  unique (box_id, position) deferrable initially immediate;

-- RPC: move or swap sample positions within the same box
create or replace function public.move_hpv_sample_position(
  p_sample_id uuid,
  p_target_position integer,
  p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_box_id uuid;
  v_from_position integer;
  v_target_id uuid;
begin
  select box_id, position into v_box_id, v_from_position
  from public.bm_hpv_samples
  where id = p_sample_id and status = 'stored'
  for update;
  if not found then raise exception 'Sample not found or not in stored status'; end if;
  if v_from_position = p_target_position then return; end if;

  select id into v_target_id
  from public.bm_hpv_samples
  where box_id = v_box_id and position = p_target_position
  for update;

  set constraints public.bm_hpv_samples_box_id_position_key deferred;

  update public.bm_hpv_samples set position = p_target_position where id = p_sample_id;
  if v_target_id is not null then
    update public.bm_hpv_samples set position = v_from_position where id = v_target_id;
  end if;
end;
$$;

revoke all on function public.move_hpv_sample_position(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.move_hpv_sample_position(uuid, integer, uuid) to service_role;
