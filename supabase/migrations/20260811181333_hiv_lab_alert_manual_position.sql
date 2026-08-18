-- HIV LAB Alert: optional manual HIV DRT rack position.
-- The Rack row lock remains the authority for both Auto-fill and manual picks.

drop function if exists public.create_hiv_lab_alert(text, text, text, uuid, uuid);

create or replace function public.create_hiv_lab_alert(
  p_hn text,
  p_ln text,
  p_patient_name_masked text,
  p_rack_id uuid,
  p_actor uuid,
  p_position integer default null
) returns table (
  alert_id uuid,
  sample_id uuid,
  rack_code text,
  rack_position integer
) language plpgsql security invoker set search_path = public as $$
declare
  v_role text;
  v_rack public.bm_hiv_drt_racks;
  v_position integer;
  v_start_position integer;
  v_candidate integer;
  v_stored_at timestamptz := now();
  v_stored_on date := (v_stored_at at time zone 'Asia/Bangkok')::date;
  v_sample_id uuid;
  v_alert_id uuid;
  v_hn text := trim(coalesce(p_hn, ''));
  v_ln text := trim(coalesce(p_ln, ''));
  v_name text := trim(coalesce(p_patient_name_masked, ''));
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role not in ('Admin', 'Staff') then
    raise exception 'HIV LAB Alert Staff permission required';
  end if;
  if v_hn = '' then raise exception 'HN is required'; end if;
  if v_ln = '' then raise exception 'LN is required'; end if;
  if v_name = '' then raise exception 'Masked patient name is required'; end if;

  select * into v_rack
  from public.bm_hiv_drt_racks
  where id = p_rack_id
  for update;
  if not found then raise exception 'HIV DRT Rack not found'; end if;

  if exists (select 1 from public.bm_hiv_drt_samples where barcode = v_ln) then
    raise exception 'Barcode already exists in HIV DRT';
  end if;

  if p_position is not null then
    if p_position < 1 or p_position > 96 then
      raise exception 'Requested HIV DRT position must be between 1 and 96';
    end if;

    if exists (
      select 1
      from public.bm_hiv_drt_samples
      where current_rack_id = v_rack.id
        and current_position = p_position
        and status = 'stored'
    ) then
      raise exception 'Requested HIV DRT position is already occupied';
    end if;

    v_position := p_position;
  else
    v_start_position := greatest(coalesce(v_rack.next_position, 1), 1);
    v_position := null;
    for v_candidate in v_start_position..96 loop
      if not exists (
        select 1
        from public.bm_hiv_drt_samples
        where current_rack_id = v_rack.id
          and current_position = v_candidate
          and status = 'stored'
      ) then
        v_position := v_candidate;
        exit;
      end if;
    end loop;

    if v_position is null or v_position < 1 or v_position > 96 then
      raise exception 'No auto-fill position is available in the selected HIV DRT Rack';
    end if;
  end if;

  insert into public.bm_hiv_drt_samples(
    barcode,
    status,
    from_storage,
    current_rack_id,
    current_position,
    stored_rack_code,
    stored_position,
    stored_at,
    stored_by,
    destroy_due_on,
    created_by
  )
  values (
    v_ln,
    'stored',
    true,
    v_rack.id,
    v_position,
    v_rack.rack_code,
    v_position,
    v_stored_at,
    p_actor,
    (v_stored_on + interval '3 months')::date,
    p_actor
  )
  returning id into v_sample_id;

  insert into public.bm_hiv_lab_alerts(
    hn,
    ln,
    patient_name_masked,
    hiv_drt_sample_id,
    created_by
  )
  values (v_hn, v_ln, v_name, v_sample_id, p_actor)
  returning id into v_alert_id;

  update public.bm_hiv_drt_racks
  set next_position = least(
        97,
        greatest(coalesce(v_rack.next_position, 1), v_position + 1)
      ),
      updated_at = v_stored_at
  where id = v_rack.id;

  return query select v_alert_id, v_sample_id, v_rack.rack_code, v_position;
end;
$$;

revoke all on function public.create_hiv_lab_alert(text, text, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_hiv_lab_alert(text, text, text, uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';
