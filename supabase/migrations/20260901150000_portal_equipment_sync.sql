-- Portal is the canonical equipment/department source for Stock-BM.
-- Local service workflow fields remain local and are never overwritten by sync.

alter table public.bm_equipment
  add column if not exists portal_equipment_id uuid,
  add column if not exists portal_department_code text,
  add column if not exists portal_department_name text,
  add column if not exists portal_status text,
  add column if not exists portal_location text,
  add column if not exists portal_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_state text not null default 'unlinked',
  add column if not exists archived_at timestamptz;

alter table public.bm_equipment
  drop constraint if exists bm_equipment_sync_state_check;
alter table public.bm_equipment
  add constraint bm_equipment_sync_state_check
  check (sync_state in ('unlinked', 'linked', 'issue', 'archived'));

create unique index if not exists bm_equipment_portal_equipment_unique
  on public.bm_equipment(portal_equipment_id)
  where portal_equipment_id is not null;
create index if not exists bm_equipment_portal_scope_idx
  on public.bm_equipment(portal_department_code, sync_state, code);

alter table public.bm_equipment_service_records
  add column if not exists portal_plan_id uuid,
  add column if not exists equipment_snapshot jsonb;

create table if not exists public.bm_equipment_portal_pmcal (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  portal_plan_id uuid not null unique,
  fiscal_year integer,
  calendar_month smallint,
  cal_type text,
  due_date date,
  provider text,
  planned_cost numeric(12,2),
  record_status text,
  version integer,
  completed_date date,
  result text,
  certificate_no text,
  portal_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (calendar_month is null or calendar_month between 1 and 12),
  check (cal_type is null or cal_type in ('PM', 'CAL'))
);

create index if not exists bm_equipment_portal_pmcal_equipment_idx
  on public.bm_equipment_portal_pmcal(equipment_id, fiscal_year desc, calendar_month);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bm_equipment_service_records'::regclass
      and conname = 'bm_equipment_service_portal_plan_fk'
  ) then
    alter table public.bm_equipment_service_records
      add constraint bm_equipment_service_portal_plan_fk
      foreign key (portal_plan_id)
      references public.bm_equipment_portal_pmcal(portal_plan_id)
      on delete set null;
  end if;
end $$;

create table if not exists public.bm_equipment_sync_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.nipt_users(id),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  archived_count integer not null default 0,
  issue_count integer not null default 0,
  error_message text
);

create index if not exists bm_equipment_sync_runs_started_idx
  on public.bm_equipment_sync_runs(started_at desc);

create table if not exists public.bm_equipment_sync_issues (
  id bigint generated always as identity primary key,
  sync_run_id uuid references public.bm_equipment_sync_runs(id) on delete set null,
  equipment_id uuid references public.bm_equipment(id) on delete set null,
  portal_equipment_id uuid,
  issue_type text not null check (issue_type in ('ambiguous_match', 'identity_conflict', 'unmatched_local')),
  reason text not null,
  candidate_local_ids uuid[] not null default '{}',
  portal_snapshot jsonb not null default '{}'::jsonb,
  issue_status text not null default 'open'
    check (issue_status in ('open', 'resolved', 'ignored')),
  resolution_note text,
  resolved_by uuid references public.nipt_users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bm_equipment_sync_issues_status_idx
  on public.bm_equipment_sync_issues(issue_status, created_at desc);
create index if not exists bm_equipment_sync_issues_equipment_idx
  on public.bm_equipment_sync_issues(equipment_id, issue_status);
create unique index if not exists bm_equipment_sync_issues_open_identity_idx
  on public.bm_equipment_sync_issues(
    coalesce(portal_equipment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(equipment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    issue_type
  )
  where issue_status = 'open';

alter table public.bm_equipment_portal_pmcal enable row level security;
alter table public.bm_equipment_sync_runs enable row level security;
alter table public.bm_equipment_sync_issues enable row level security;

drop policy if exists bm_equipment_portal_pmcal_read on public.bm_equipment_portal_pmcal;
create policy bm_equipment_portal_pmcal_read on public.bm_equipment_portal_pmcal
  for select to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));
drop policy if exists bm_equipment_sync_runs_read on public.bm_equipment_sync_runs;
create policy bm_equipment_sync_runs_read on public.bm_equipment_sync_runs
  for select to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));
drop policy if exists bm_equipment_sync_issues_read on public.bm_equipment_sync_issues;
create policy bm_equipment_sync_issues_read on public.bm_equipment_sync_issues
  for select to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_equipment_portal_pmcal,
  public.bm_equipment_sync_runs,
  public.bm_equipment_sync_issues to authenticated;
grant select, insert, update, delete on public.bm_equipment_portal_pmcal,
  public.bm_equipment_sync_runs,
  public.bm_equipment_sync_issues to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Apply one complete, validated snapshot in the database transaction opened by
-- the RPC. The application fetches every Portal page before calling this RPC.
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
  v_cbh_code text;
  v_code text;
  v_id uuid;
  v_existing public.bm_equipment%rowtype;
  v_plan jsonb;
begin
  v_portal_id := nullif(p_portal->>'portal_equipment_id', '')::uuid;
  v_department_code := nullif(trim(p_portal->>'department_code'), '');
  v_equipment_type := nullif(trim(p_portal->>'equipment_type'), '');
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
      code, name, manufacturer, model, serial_number, asset_number,
      status, portal_equipment_id, portal_department_code,
      portal_department_name, portal_status, portal_location,
      portal_updated_at, last_synced_at, sync_state, archived_at,
      created_by, updated_by
    ) values (
      v_code, v_equipment_type, nullif(trim(p_portal->>'manufacturer'), ''),
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
      updated_at = now();
  end loop;

  return v_id;
end;
$$;

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
  v_operation jsonb;
  v_portal jsonb;
  v_issue jsonb;
  v_local_id uuid;
  v_target_id uuid;
  v_existing_id uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_issues integer := 0;
  v_row_count integer;
begin
  if p_sync_run_id is null or p_actor is null then raise exception 'Sync context is required'; end if;
  perform pg_advisory_xact_lock(hashtext('stock-bm-portal-equipment-sync'));

  if jsonb_array_length(p_operations) <> (
    select count(distinct value->'portal'->>'portal_equipment_id')
    from jsonb_array_elements(p_operations)
  ) then
    raise exception 'Portal snapshot contains duplicate equipment ids';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_portal := v_operation->'portal';
    v_issue := v_operation->'issue';
    v_local_id := nullif(v_operation->>'local_equipment_id', '')::uuid;

    if v_issue is not null and v_issue <> 'null'::jsonb then
      if v_local_id is not null then
        update public.bm_equipment
        set sync_state = 'issue', last_synced_at = now(),
            updated_by = p_actor, updated_at = now()
        where id = v_local_id and portal_equipment_id is null;
      end if;
      insert into public.bm_equipment_sync_issues (
        sync_run_id, equipment_id, portal_equipment_id, issue_type,
        reason, candidate_local_ids, portal_snapshot
      ) values (
        p_sync_run_id, v_local_id,
        nullif(v_portal->>'portal_equipment_id', '')::uuid,
        v_issue->>'issue_type', v_issue->>'reason',
        coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(v_issue->'candidate_local_ids', '[]'::jsonb))), '{}'),
        v_portal
      )
      on conflict do nothing;
      get diagnostics v_row_count = row_count;
      v_issues := v_issues + v_row_count;
      continue;
    end if;

    select id into v_existing_id
    from public.bm_equipment
    where (v_local_id is not null and id = v_local_id)
       or (v_local_id is null and portal_equipment_id = nullif(v_portal->>'portal_equipment_id', '')::uuid)
    limit 1;
    if v_existing_id is null then v_created := v_created + 1; else v_updated := v_updated + 1; end if;

    v_target_id := public.upsert_bm_portal_equipment(v_portal, v_local_id, p_actor);
  end loop;

  if coalesce(array_length(p_unmatched_local_ids, 1), 0) > 0 then
    update public.bm_equipment
    set sync_state = 'issue', last_synced_at = now(),
        updated_by = p_actor, updated_at = now()
    where id = any(p_unmatched_local_ids)
      and portal_equipment_id is null
      and sync_state <> 'archived';

    insert into public.bm_equipment_sync_issues (
      sync_run_id, equipment_id, issue_type, reason, portal_snapshot
    )
    select p_sync_run_id, equipment.id, 'unmatched_local',
      'ไม่พบเครื่องมือเดิมใน Snapshot จาก Portal กรุณาตรวจสอบการจับคู่', '{}'::jsonb
    from public.bm_equipment equipment
    where equipment.id = any(p_unmatched_local_ids)
      and equipment.portal_equipment_id is null
      and not exists (
        select 1 from public.bm_equipment_sync_issues issue
        where issue.equipment_id = equipment.id
          and issue.issue_type = 'unmatched_local'
          and issue.issue_status = 'open'
      );
    get diagnostics v_row_count = row_count;
    v_issues := v_issues + v_row_count;
  end if;

  update public.bm_equipment
  set sync_state = 'archived', archived_at = now(), last_synced_at = now(),
      updated_by = p_actor, updated_at = now()
  where portal_equipment_id is not null
    and portal_department_code in ('BIOMOLECULAR', 'OUTLAB')
    and not exists (
      select 1 from jsonb_array_elements(p_operations) operation
      where (operation->'portal'->>'portal_equipment_id')::uuid = bm_equipment.portal_equipment_id
    );
  get diagnostics v_archived = row_count;

  update public.bm_equipment_sync_runs
  set status = 'succeeded', finished_at = now(),
      source_count = jsonb_array_length(p_operations),
      created_count = v_created, updated_count = v_updated,
      archived_count = v_archived, issue_count = v_issues,
      error_message = null
  where id = p_sync_run_id;

  return jsonb_build_object(
    'source_count', jsonb_array_length(p_operations),
    'created_count', v_created,
    'updated_count', v_updated,
    'archived_count', v_archived,
    'issue_count', v_issues
  );
end;
$$;

create or replace function public.resolve_bm_equipment_sync_issue(
  p_issue_id bigint,
  p_local_equipment_id uuid,
  p_actor uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_issue public.bm_equipment_sync_issues%rowtype;
begin
  select * into v_issue
  from public.bm_equipment_sync_issues
  where id = p_issue_id and issue_status = 'open'
  for update;
  if not found then raise exception 'Sync issue is not open'; end if;
  if v_issue.issue_type = 'unmatched_local' then
    raise exception 'Unmatched local equipment has no Portal item to resolve';
  end if;
  if p_local_equipment_id is null then raise exception 'Local equipment is required'; end if;
  perform public.upsert_bm_portal_equipment(v_issue.portal_snapshot, p_local_equipment_id, p_actor);
  update public.bm_equipment_sync_issues
  set issue_status = 'resolved', equipment_id = p_local_equipment_id,
      resolved_by = p_actor, resolved_at = now(),
      resolution_note = 'จับคู่โดยผู้ดูแลระบบ'
  where id = p_issue_id;
end;
$$;

revoke all on function public.upsert_bm_portal_equipment(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_bm_equipment_snapshot(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.resolve_bm_equipment_sync_issue(bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.upsert_bm_portal_equipment(jsonb, uuid, uuid) to service_role;
grant execute on function public.sync_bm_equipment_snapshot(uuid, uuid, jsonb, uuid[]) to service_role;
grant execute on function public.resolve_bm_equipment_sync_issue(bigint, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
