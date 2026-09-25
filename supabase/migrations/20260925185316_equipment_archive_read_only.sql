-- Prepared archive lock for the equipment feature. It remains disabled until
-- an explicitly authorized operator enables the singleton control row.
create table if not exists public.bm_equipment_archive_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.bm_equipment_archive_control(singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.bm_equipment_archive_control enable row level security;
revoke all on public.bm_equipment_archive_control from public, anon, authenticated;
grant select, insert, update, delete on public.bm_equipment_archive_control to service_role;

create or replace function public.guard_equipment_archive_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_module text;
begin
  if tg_table_name = 'bm_attachments' then
    if tg_op = 'DELETE' then v_module := to_jsonb(old)->>'module';
    else v_module := to_jsonb(new)->>'module'; end if;
    if v_module is distinct from 'equipment' then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;

  select control.enabled into v_enabled
  from public.bm_equipment_archive_control control
  where control.singleton = true;
  if coalesce(v_enabled, false) then
    raise exception 'Equipment records are archived and read-only; use Portal'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_equipment_archive_write() from public, anon, authenticated;
grant execute on function public.guard_equipment_archive_write() to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'bm_equipment',
    'bm_equipment_plans',
    'bm_equipment_service_records',
    'bm_equipment_module_links',
    'bm_equipment_technicians',
    'bm_equipment_routine_maintenance',
    'bm_equipment_routine_holidays',
    'bm_equipment_routine_reviewers',
    'bm_equipment_routine_reviews',
    'bm_equipment_routine_forms',
    'bm_equipment_routine_form_versions',
    'bm_equipment_routine_form_items',
    'bm_equipment_routine_response_sets',
    'bm_equipment_routine_response_options',
    'bm_equipment_portal_pmcal',
    'bm_equipment_sync_runs',
    'bm_equipment_sync_issues'
  ] loop
    execute format('drop trigger if exists equipment_archive_read_only on public.%I', v_table);
    execute format(
      'create trigger equipment_archive_read_only before insert or update or delete on public.%I for each row execute function public.guard_equipment_archive_write()',
      v_table
    );
  end loop;
end;
$$;

drop trigger if exists equipment_archive_read_only on public.bm_attachments;
create trigger equipment_archive_read_only
before insert or update or delete on public.bm_attachments
for each row execute function public.guard_equipment_archive_write();

notify pgrst, 'reload schema';
