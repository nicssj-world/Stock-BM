-- Fix the exact LAB-code lookup for new equipment rows.
-- PostgreSQL does not provide min(uuid); find the single matching row in two
-- steps so a new Portal item can be inserted without changing other rows.

create or replace function public.sync_bm_equipment_by_lab_code(
  p_sync_run_id uuid,
  p_actor uuid,
  p_portal jsonb,
  p_local_equipment_id uuid default null,
  p_portal_photo jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lab_code text;
  v_existing_id uuid;
  v_target_id uuid;
  v_existing_count integer := 0;
  v_created integer := 0;
  v_updated integer := 0;
  v_old_paths text[] := '{}';
  v_replaced_photo_paths jsonb := '[]'::jsonb;
begin
  if p_sync_run_id is null or p_actor is null then
    raise exception 'Sync context is required';
  end if;

  v_lab_code := nullif(trim(p_portal->>'cbh_code'), '');
  if v_lab_code is null or v_lab_code !~* '^LAB-[A-Z0-9]+(?:-[A-Z0-9]+)+$' then
    raise exception 'A valid Portal LAB code is required';
  end if;

  if p_local_equipment_id is not null then
    select id into v_existing_id
    from public.bm_equipment
    where id = p_local_equipment_id
    for update;
    if v_existing_id is null then
      raise exception 'Local equipment target not found';
    end if;
  else
    select count(*)::integer into v_existing_count
    from public.bm_equipment
    where lower(trim(code)) = lower(v_lab_code);
    if v_existing_count > 1 then
      raise exception 'LAB code is duplicated in Stock-BM';
    end if;

    select id into v_existing_id
    from public.bm_equipment
    where lower(trim(code)) = lower(v_lab_code)
    order by id
    limit 1
    for update;
  end if;

  if v_existing_id is null then
    select id into v_existing_id
    from public.bm_equipment
    where portal_equipment_id = nullif(p_portal->>'portal_equipment_id', '')::uuid
    for update;
  end if;

  if v_existing_id is null then
    v_created := 1;
  else
    v_updated := 1;
  end if;

  v_target_id := public.upsert_bm_portal_equipment(
    p_portal,
    v_existing_id,
    p_actor
  );

  if p_portal_photo is not null and jsonb_typeof(p_portal_photo) = 'object' then
    if nullif(trim(p_portal_photo->>'storage_path'), '') is null
       or nullif(trim(p_portal_photo->>'content_type'), '') is null
       or nullif(trim(p_portal_photo->>'size_bytes'), '') is null then
      raise exception 'Portal photo metadata is incomplete';
    end if;

    select coalesce(array_agg(storage_path), '{}')
      into v_old_paths
    from public.bm_attachments
    where module = 'equipment'
      and entity_type = 'equipment'
      and entity_id = v_target_id
      and kind = 'equipment-photo';

    v_replaced_photo_paths := to_jsonb(v_old_paths);

    delete from public.bm_attachments
    where module = 'equipment'
      and entity_type = 'equipment'
      and entity_id = v_target_id
      and kind = 'equipment-photo';

    insert into public.bm_attachments (
      module, entity_type, entity_id, kind, storage_path, file_name,
      content_type, size_bytes, uploaded_by, source
    ) values (
      'equipment',
      'equipment',
      v_target_id,
      'equipment-photo',
      trim(p_portal_photo->>'storage_path'),
      coalesce(nullif(trim(p_portal_photo->>'file_name'), ''), 'portal-photo'),
      trim(p_portal_photo->>'content_type'),
      (p_portal_photo->>'size_bytes')::bigint,
      p_actor,
      'portal_sync'
    );
  end if;

  update public.bm_equipment_sync_runs
  set status = 'succeeded',
      finished_at = now(),
      source_count = 1,
      created_count = v_created,
      updated_count = v_updated,
      archived_count = 0,
      issue_count = 0,
      error_message = null
  where id = p_sync_run_id;

  return jsonb_build_object(
    'equipment_id', v_target_id,
    'source_count', 1,
    'created_count', v_created,
    'updated_count', v_updated,
    'archived_count', 0,
    'issue_count', 0,
    'replaced_photo_paths', v_replaced_photo_paths
  );
end;
$$;

revoke all on function public.sync_bm_equipment_by_lab_code(uuid, uuid, jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_bm_equipment_by_lab_code(uuid, uuid, jsonb, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
