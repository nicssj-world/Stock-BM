-- Portal owns the canonical equipment photo for linked Stock-BM equipment.
-- The binary is staged by the server in the private bm-quality bucket before
-- the sync transaction. This migration replaces the attachment metadata in
-- that same transaction, while the application removes old objects after the
-- transaction commits.

alter table public.bm_attachments
  drop constraint if exists bm_attachments_source_check;

alter table public.bm_attachments
  add constraint bm_attachments_source_check
  check (source in ('internal', 'public_qr', 'portal_sync'));

create index if not exists bm_attachments_portal_photo_idx
  on public.bm_attachments(entity_id, created_at desc)
  where module = 'equipment' and entity_type = 'equipment' and kind = 'equipment-photo';

alter function public.sync_bm_equipment_snapshot(uuid, uuid, jsonb, uuid[])
  rename to sync_bm_equipment_snapshot_without_photos;

create or replace function public.sync_bm_equipment_snapshot(
  p_sync_run_id uuid,
  p_actor uuid,
  p_operations jsonb,
  p_unmatched_local_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_operation jsonb;
  v_photo jsonb;
  v_target_id uuid;
  v_old_paths text[];
  v_replaced_photo_paths jsonb := '[]'::jsonb;
begin
  -- The original function performs the complete data snapshot and archives
  -- only after it has validated the full Portal snapshot. Calling it here
  -- keeps equipment, PM/CAL, issue, and photo metadata changes atomic.
  v_result := public.sync_bm_equipment_snapshot_without_photos(
    p_sync_run_id,
    p_actor,
    p_operations,
    p_unmatched_local_ids
  );

  for v_operation in
    select value from jsonb_array_elements(coalesce(p_operations, '[]'::jsonb))
  loop
    if v_operation->'issue' is not null
       and v_operation->'issue' <> 'null'::jsonb then
      continue;
    end if;

    v_photo := v_operation->'portal_photo';
    if v_photo is null or jsonb_typeof(v_photo) <> 'object' then
      -- No Portal image means keep the current Stock-BM image unchanged.
      continue;
    end if;
    if nullif(trim(v_photo->>'storage_path'), '') is null
       or nullif(trim(v_photo->>'content_type'), '') is null
       or nullif(trim(v_photo->>'size_bytes'), '') is null then
      raise exception 'Portal photo metadata is incomplete';
    end if;

    select id into v_target_id
    from public.bm_equipment
    where portal_equipment_id = nullif(v_operation->'portal'->>'portal_equipment_id', '')::uuid
    for update;
    if v_target_id is null then
      raise exception 'Portal photo target equipment was not created';
    end if;

    select coalesce(array_agg(storage_path), '{}'::text[])
      into v_old_paths
    from public.bm_attachments
    where module = 'equipment'
      and entity_type = 'equipment'
      and entity_id = v_target_id
      and kind = 'equipment-photo';

    v_replaced_photo_paths := v_replaced_photo_paths || to_jsonb(v_old_paths);

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
      trim(v_photo->>'storage_path'),
      coalesce(nullif(trim(v_photo->>'file_name'), ''), 'portal-photo'),
      trim(v_photo->>'content_type'),
      (v_photo->>'size_bytes')::bigint,
      p_actor,
      'portal_sync'
    );
  end loop;

  return v_result || jsonb_build_object(
    'replaced_photo_paths', v_replaced_photo_paths
  );
end;
$$;

revoke all on function public.sync_bm_equipment_snapshot_without_photos(uuid, uuid, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.sync_bm_equipment_snapshot_without_photos(uuid, uuid, jsonb, uuid[])
  to service_role;
revoke all on function public.sync_bm_equipment_snapshot(uuid, uuid, jsonb, uuid[])
  from public, anon, authenticated;
grant execute on function public.sync_bm_equipment_snapshot(uuid, uuid, jsonb, uuid[])
  to service_role;

notify pgrst, 'reload schema';
