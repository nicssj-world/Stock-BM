-- HIV LAB Alert: masked patient identity, manual LINE notification,
-- and atomic linkage to an HIV DRT storage sample.

create table public.bm_hiv_lab_alerts (
  id uuid primary key default gen_random_uuid(),
  hn text not null check (nullif(trim(hn), '') is not null),
  ln text not null check (nullif(trim(ln), '') is not null),
  patient_name_masked text not null check (nullif(trim(patient_name_masked), '') is not null),
  hiv_drt_sample_id uuid not null unique references public.bm_hiv_drt_samples(id),
  line_status text not null default 'pending' check (line_status in ('pending', 'sending', 'sent')),
  line_sent_at timestamptz,
  line_sent_by uuid references public.nipt_users(id),
  line_send_attempts integer not null default 0 check (line_send_attempts >= 0),
  line_retry_key uuid,
  line_send_started_at timestamptz,
  line_message_date date,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ln)
);

create index bm_hiv_lab_alerts_created_at on public.bm_hiv_lab_alerts(created_at desc);
create index bm_hiv_lab_alerts_pending on public.bm_hiv_lab_alerts(created_at desc)
  where line_status <> 'sent';

alter table public.bm_hiv_lab_alerts enable row level security;

create policy bm_hiv_lab_alerts_staff_read on public.bm_hiv_lab_alerts
for select to authenticated
using (public.current_bm_role() in ('Admin', 'Staff'));

revoke all on public.bm_hiv_lab_alerts from anon;
revoke insert, update, delete on public.bm_hiv_lab_alerts from authenticated;
grant select on public.bm_hiv_lab_alerts to authenticated;
grant all on public.bm_hiv_lab_alerts to service_role;

-- The server already masks the raw name. This invoker function performs the
-- two inserts under one transaction while serializing the selected rack row.
create or replace function public.create_hiv_lab_alert(
  p_hn text,
  p_ln text,
  p_patient_name_masked text,
  p_rack_id uuid,
  p_actor uuid
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
  set next_position = least(97, v_position + 1),
      updated_at = v_stored_at
  where id = v_rack.id;

  return query select v_alert_id, v_sample_id, v_rack.rack_code, v_position;
end;
$$;

-- An unsent Alert can be removed only together with its still-stored sample.
-- The row locks make this safe if an operator opens the same Alert twice.
create or replace function public.delete_hiv_lab_alert(
  p_alert_id uuid,
  p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_role text;
  v_sample_id uuid;
  v_sample_status text;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role not in ('Admin', 'Staff') then
    raise exception 'HIV LAB Alert Staff permission required';
  end if;

  select hiv_drt_sample_id into v_sample_id
  from public.bm_hiv_lab_alerts
  where id = p_alert_id
    and line_sent_at is null
    and line_status <> 'sent'
  for update;
  if not found then raise exception 'Alert not found or already sent'; end if;

  select status into v_sample_status
  from public.bm_hiv_drt_samples
  where id = v_sample_id
  for update;
  if not found then raise exception 'Linked HIV DRT sample not found'; end if;
  if v_sample_status <> 'stored' then
    raise exception 'Cannot delete an Alert after HIV DRT storage has advanced';
  end if;

  delete from public.bm_hiv_lab_alerts where id = p_alert_id;
  delete from public.bm_hiv_drt_samples where id = v_sample_id;
end;
$$;

revoke all on function public.delete_hiv_lab_alert(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_hiv_lab_alert(uuid, uuid) to service_role;

revoke all on function public.create_hiv_lab_alert(text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_hiv_lab_alert(text, text, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
