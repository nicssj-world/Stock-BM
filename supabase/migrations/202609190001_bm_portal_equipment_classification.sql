-- The Portal equipment sync API now sends a real `classification` value
-- (Portal's own standard vocabulary, e.g. "Refrigerator" — separate from
-- equipment_type, which becomes `name`). Write it into bm_equipment.category,
-- the same column the Stock-BM-local Classification override already uses.
--
-- On update this only OVERWRITES category when Portal actually sends a
-- non-empty classification for this sync: if Portal has nothing recorded yet
-- for a given item, whatever is already in category (including a value a
-- Stock-BM operator set manually) is left untouched rather than blanked out.

create or replace function public.upsert_bm_portal_equipment(
  p_portal jsonb,
  p_local_equipment_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_portal_id uuid;
  v_department_code text;
  v_equipment_type text;
  v_classification text;
  v_cbh_code text;
  v_code text;
  v_id uuid;
  v_existing public.bm_equipment%rowtype;
  v_plan jsonb;
begin
  v_portal_id := nullif(p_portal->>'portal_equipment_id', '')::uuid;
  v_department_code := nullif(trim(p_portal->>'department_code'), '');
  v_equipment_type := nullif(trim(p_portal->>'equipment_type'), '');
  v_classification := nullif(trim(p_portal->>'classification'), '');
  v_cbh_code := nullif(trim(p_portal->>'cbh_code'), '');

  if v_portal_id is null then raise exception 'Portal equipment id is required'; end if;
  if v_department_code not in ('BIOMOLECULAR', 'OUTLAB') then
    raise exception 'Portal department code is outside Stock-BM scope';
  end if;
  if v_equipment_type is null then raise exception 'Portal equipment type is required'; end if;

  if p_local_equipment_id is not null then
    select * into v_existing
    from public.bm_equipment
    where id = p_local_equipment_id
    for update;
    if not found then raise exception 'Local equipment target not found'; end if;
    if v_existing.portal_equipment_id is not null
       and v_existing.portal_equipment_id <> v_portal_id then
      raise exception 'Local equipment is already linked to another Portal item';
    end if;
    v_id := v_existing.id;
  else
    select * into v_existing
    from public.bm_equipment
    where portal_equipment_id = v_portal_id
    for update;
    if found then
      v_id := v_existing.id;
    end if;
  end if;

  v_code := coalesce(v_cbh_code, nullif(v_existing.code, ''), 'PORTAL-' || substr(replace(v_portal_id::text, '-', ''), 1, 12));

  if v_id is null then
    insert into public.bm_equipment (
      code, name, category, manufacturer, model, serial_number, asset_number,
      status, portal_equipment_id, portal_department_code,
      portal_department_name, portal_status, portal_location,
      portal_updated_at, last_synced_at, sync_state, archived_at,
      created_by, updated_by
    ) values (
      v_code, v_equipment_type, v_classification, nullif(trim(p_portal->>'manufacturer'), ''),
      nullif(trim(p_portal->>'model'), ''), nullif(trim(p_portal->>'serial_number'), ''),
      nullif(trim(p_portal->>'hospital_asset_no'), ''), 'active', v_portal_id,
      v_department_code, nullif(trim(p_portal->>'department_name'), ''),
      nullif(trim(p_portal->>'portal_status'), ''), nullif(trim(p_portal->>'portal_location'), ''),
      nullif(p_portal->>'portal_updated_at', '')::timestamptz, now(), 'linked', null,
      p_actor, p_actor
    ) returning id into v_id;
  else
    update public.bm_equipment
    set code = v_code,
        name = v_equipment_type,
        category = coalesce(v_classification, category),
        manufacturer = nullif(trim(p_portal->>'manufacturer'), ''),
        model = nullif(trim(p_portal->>'model'), ''),
        serial_number = nullif(trim(p_portal->>'serial_number'), ''),
        asset_number = nullif(trim(p_portal->>'hospital_asset_no'), ''),
        portal_equipment_id = v_portal_id,
        portal_department_code = v_department_code,
        portal_department_name = nullif(trim(p_portal->>'department_name'), ''),
        portal_status = nullif(trim(p_portal->>'portal_status'), ''),
        portal_location = nullif(trim(p_portal->>'portal_location'), ''),
        portal_updated_at = nullif(p_portal->>'portal_updated_at', '')::timestamptz,
        last_synced_at = now(),
        sync_state = 'linked',
        archived_at = null,
        updated_by = p_actor,
        updated_at = now()
    where id = v_id;
  end if;

  -- Keep old Portal plans as cancelled evidence so service-record references do
  -- not disappear when a Portal plan is removed from the next snapshot. The UI
  -- only presents active rows for new work.
  update public.bm_equipment_portal_pmcal
  set record_status = 'cancelled', updated_at = now()
  where equipment_id = v_id;
  for v_plan in select value from jsonb_array_elements(coalesce(p_portal->'pm_cal_summary', '[]'::jsonb))
  loop
    insert into public.bm_equipment_portal_pmcal (
      equipment_id, portal_plan_id, fiscal_year, calendar_month, cal_type,
      due_date, provider, planned_cost, record_status, version,
      completed_date, result, certificate_no, portal_updated_at, updated_at
    ) values (
      v_id, (v_plan->>'portal_plan_id')::uuid,
      nullif(v_plan->>'fiscal_year', '')::integer,
      nullif(v_plan->>'calendar_month', '')::smallint,
      nullif(v_plan->>'cal_type', ''), nullif(v_plan->>'due_date', '')::date,
      nullif(v_plan->>'provider', ''), nullif(v_plan->>'planned_cost', '')::numeric,
      nullif(v_plan->>'record_status', ''), nullif(v_plan->>'version', '')::integer,
      nullif(v_plan->>'completed_date', '')::date, nullif(v_plan->>'result', ''),
      nullif(v_plan->>'certificate_no', ''), nullif(v_plan->>'updated_at', '')::timestamptz, now()
    )
    on conflict (portal_plan_id) do update set
      equipment_id = excluded.equipment_id,
      fiscal_year = excluded.fiscal_year,
      calendar_month = excluded.calendar_month,
      cal_type = excluded.cal_type,
      due_date = excluded.due_date,
      provider = excluded.provider,
      planned_cost = excluded.planned_cost,
      record_status = excluded.record_status,
      version = excluded.version,
      completed_date = excluded.completed_date,
      result = excluded.result,
      certificate_no = excluded.certificate_no,
      portal_updated_at = excluded.portal_updated_at,
      updated_at = excluded.updated_at;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.upsert_bm_portal_equipment(jsonb, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.upsert_bm_portal_equipment(jsonb, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
