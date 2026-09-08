-- Configurable response-option sets for Routine Maintenance checklists.
-- Every checklist item today answers with a hardcoded 3-value dropdown
-- (done / not-applicable / not-done). This introduces a reusable, global
-- catalog of option sets (e.g. "ปกติ / ชำรุด") that a form version can pick,
-- so admins can add new vocabularies without a code change.

create table if not exists public.bm_equipment_routine_response_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null),
  is_active boolean not null default true,
  created_by uuid references public.nipt_users(id),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bm_equipment_routine_response_sets_name_unique
  on public.bm_equipment_routine_response_sets(lower(trim(name)));

create table if not exists public.bm_equipment_routine_response_options (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.bm_equipment_routine_response_sets(id) on delete cascade,
  position integer not null check (position > 0),
  value text not null check (nullif(trim(value), '') is not null),
  label text not null check (nullif(trim(label), '') is not null),
  mark text not null check (nullif(trim(mark), '') is not null),
  unique (set_id, position),
  unique (set_id, value)
);
create index if not exists bm_equipment_routine_response_options_set
  on public.bm_equipment_routine_response_options(set_id, position);

-- Seed the legacy set with the exact values every existing version already
-- uses, so backfilling below is a pure rename with no behaviour change.
do $$
declare
  legacy_set uuid;
  normal_set uuid;
  migration_user uuid;
begin
  select id into migration_user
    from public.nipt_users
   order by is_active desc, id
   limit 1;

  select id into legacy_set
    from public.bm_equipment_routine_response_sets
   where lower(trim(name)) = lower('ทำแล้ว / N/A / ยังไม่ทำ');
  if legacy_set is null then
    insert into public.bm_equipment_routine_response_sets(name, created_by, updated_by)
    values ('ทำแล้ว / N/A / ยังไม่ทำ', migration_user, migration_user)
    returning id into legacy_set;
    insert into public.bm_equipment_routine_response_options(set_id, position, value, label, mark)
    values
      (legacy_set, 1, 'done', '✓ ทำแล้ว', '✓'),
      (legacy_set, 2, 'not-applicable', 'N/A ไม่เกี่ยวข้อง', 'N/A'),
      (legacy_set, 3, 'not-done', '✕ ยังไม่ทำ', '✕');
  end if;

  select id into normal_set
    from public.bm_equipment_routine_response_sets
   where lower(trim(name)) = lower('ปกติ / ชำรุด');
  if normal_set is null then
    insert into public.bm_equipment_routine_response_sets(name, created_by, updated_by)
    values ('ปกติ / ชำรุด', migration_user, migration_user)
    returning id into normal_set;
    insert into public.bm_equipment_routine_response_options(set_id, position, value, label, mark)
    values
      (normal_set, 1, 'normal', 'ปกติ', '✓'),
      (normal_set, 2, 'damaged', 'ชำรุด', '✕');
  end if;
end $$;

-- The response set is chosen per checklist item (not per form/version),
-- since a single form can mix vocabularies (e.g. one item answered
-- done/not-done, another answered normal/damaged).
alter table public.bm_equipment_routine_form_items
  add column if not exists response_set_id uuid;

update public.bm_equipment_routine_form_items item
   set response_set_id = legacy.id
  from (
    select id from public.bm_equipment_routine_response_sets
     where lower(trim(name)) = lower('ทำแล้ว / N/A / ยังไม่ทำ')
  ) legacy
 where item.response_set_id is null;

alter table public.bm_equipment_routine_form_items
  alter column response_set_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bm_equipment_routine_form_items_response_set_fk'
  ) then
    alter table public.bm_equipment_routine_form_items
      add constraint bm_equipment_routine_form_items_response_set_fk
      foreign key (response_set_id) references public.bm_equipment_routine_response_sets(id);
  end if;
end $$;

-- Defensive cleanup: an earlier draft of this migration put response_set_id
-- on the version instead of the item before that design was corrected. This
-- is a no-op on a database that only ever ran this (already-corrected) file.
alter table public.bm_equipment_routine_form_versions
  drop column if exists response_set_id;

alter table public.bm_equipment_routine_response_sets enable row level security;
alter table public.bm_equipment_routine_response_options enable row level security;

drop policy if exists bm_equipment_routine_response_sets_read on public.bm_equipment_routine_response_sets;
create policy bm_equipment_routine_response_sets_read on public.bm_equipment_routine_response_sets
  for select using (public.current_bm_role() in ('Admin', 'Staff'));
drop policy if exists bm_equipment_routine_response_options_read on public.bm_equipment_routine_response_options;
create policy bm_equipment_routine_response_options_read on public.bm_equipment_routine_response_options
  for select using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_equipment_routine_response_sets,
  public.bm_equipment_routine_response_options to authenticated;
grant select, insert, update, delete on public.bm_equipment_routine_response_sets,
  public.bm_equipment_routine_response_options to service_role;

notify pgrst, 'reload schema';
