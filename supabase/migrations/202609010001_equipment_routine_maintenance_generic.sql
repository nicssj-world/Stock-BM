-- Generic, versioned Routine Maintenance forms for every equipment item.
-- The existing FACSLYRIC routine tables are upgraded in place so existing
-- entries, reviews, and holidays remain available after the migration.

create table if not exists public.bm_equipment_routine_forms (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  name text not null check (nullif(trim(name), '') is not null),
  reviewer_id uuid references public.nipt_users(id),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bm_equipment_routine_forms_name_unique
  on public.bm_equipment_routine_forms(equipment_id, lower(trim(name)));
create index if not exists bm_equipment_routine_forms_equipment
  on public.bm_equipment_routine_forms(equipment_id, is_active, lower(name));

create table if not exists public.bm_equipment_routine_form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.bm_equipment_routine_forms(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  starts_on date not null,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (form_id, version_number),
  unique (form_id, starts_on)
);
create index if not exists bm_equipment_routine_form_versions_schedule
  on public.bm_equipment_routine_form_versions(form_id, starts_on desc);

create table if not exists public.bm_equipment_routine_form_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.bm_equipment_routine_form_versions(id) on delete cascade,
  position integer not null check (position > 0),
  label text not null check (nullif(trim(label), '') is not null),
  unique (version_id, position)
);
create index if not exists bm_equipment_routine_form_items_version
  on public.bm_equipment_routine_form_items(version_id, position);

alter table public.bm_equipment_routine_maintenance
  add column if not exists form_id uuid,
  add column if not exists version_id uuid,
  add column if not exists planned_on date,
  add column if not exists source text not null default 'internal',
  add column if not exists idempotency_key uuid;

alter table public.bm_equipment_routine_maintenance
  drop constraint if exists bm_equipment_routine_maintenance_frequency_check;
alter table public.bm_equipment_routine_maintenance
  add constraint bm_equipment_routine_maintenance_frequency_generic_check
  check (frequency in ('daily', 'weekly', 'monthly', 'yearly'));
alter table public.bm_equipment_routine_maintenance
  add constraint bm_equipment_routine_maintenance_source_check
  check (source in ('internal', 'qr'));
alter table public.bm_equipment_routine_maintenance
  add constraint bm_equipment_routine_maintenance_qr_key_check
  check (source <> 'qr' or idempotency_key is not null);

do $$
declare
  item record;
begin
  for item in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bm_equipment_routine_maintenance'
      and constraint_type = 'UNIQUE'
  loop
    if item.constraint_name <> 'bm_equipment_routine_maintenance_pkey' then
      execute format(
        'alter table public.bm_equipment_routine_maintenance drop constraint if exists %I',
        item.constraint_name
      );
    end if;
  end loop;
end $$;

update public.bm_equipment_routine_maintenance
set planned_on = coalesce(planned_on, performed_on),
    source = coalesce(source, 'internal');

alter table public.bm_equipment_routine_holidays
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists form_id uuid;
alter table public.bm_equipment_routine_holidays
  drop constraint if exists bm_equipment_routine_holidays_pkey;
alter table public.bm_equipment_routine_holidays
  add constraint bm_equipment_routine_holidays_pkey primary key (id);
create unique index if not exists bm_equipment_routine_holidays_form_date
  on public.bm_equipment_routine_holidays(form_id, date);
create index if not exists bm_equipment_routine_holidays_form
  on public.bm_equipment_routine_holidays(form_id, date desc);

alter table public.bm_equipment_routine_reviews
  add column if not exists form_id uuid;
alter table public.bm_equipment_routine_reviews
  drop constraint if exists bm_equipment_routine_reviews_frequency_check;
alter table public.bm_equipment_routine_reviews
  add constraint bm_equipment_routine_reviews_frequency_generic_check
  check (frequency in ('daily', 'weekly', 'monthly', 'yearly'));
do $$
declare
  item record;
begin
  for item in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'bm_equipment_routine_reviews'
      and constraint_type = 'UNIQUE'
  loop
    if item.constraint_name <> 'bm_equipment_routine_reviews_pkey' then
      execute format(
        'alter table public.bm_equipment_routine_reviews drop constraint if exists %I',
        item.constraint_name
      );
    end if;
  end loop;
end $$;

-- Seed the two existing FACSLYRIC forms. The form rows are created only when
-- the equipment already exists, which keeps fresh installations safe.
do $$
declare
  equipment_row record;
  legacy_reviewer uuid;
  daily_form uuid;
  monthly_form uuid;
  daily_version uuid;
  monthly_version uuid;
  start_date date;
  migration_user uuid;
begin
  select id into migration_user
    from public.nipt_users
   order by is_active desc, id
   limit 1;

  select id, installed_on
    into equipment_row
    from public.bm_equipment
   where upper(code) = 'FACSLYRIC'
      or lower(name) like '%facslyric%'
   order by case when upper(code) = 'FACSLYRIC' then 0 else 1 end, created_at
   limit 1;

  if equipment_row.id is null then
    return;
  end if;

  select reviewer_id into legacy_reviewer
    from public.bm_equipment_routine_reviewers
   where equipment_id = equipment_row.id;

  select coalesce(min(performed_on), equipment_row.installed_on, current_date)
    into start_date
    from public.bm_equipment_routine_maintenance
   where equipment_id = equipment_row.id
     and frequency = 'daily';

  select id into daily_form
    from public.bm_equipment_routine_forms
   where equipment_id = equipment_row.id and lower(trim(name)) = lower('Daily Maintenance');
  if daily_form is null then
    insert into public.bm_equipment_routine_forms(equipment_id, name, reviewer_id, created_by, updated_by)
    values (equipment_row.id, 'Daily Maintenance', legacy_reviewer, migration_user, legacy_reviewer)
    returning id into daily_form;
  end if;
  update public.bm_equipment_routine_forms
     set reviewer_id = coalesce(reviewer_id, legacy_reviewer)
   where id = daily_form and legacy_reviewer is not null;

  select id into daily_version
    from public.bm_equipment_routine_form_versions
   where form_id = daily_form and version_number = 1;
  if daily_version is null then
    insert into public.bm_equipment_routine_form_versions(form_id, version_number, frequency, starts_on, created_by)
    values (daily_form, 1, 'daily', start_date, migration_user)
    returning id into daily_version;
    insert into public.bm_equipment_routine_form_items(version_id, position, label)
    select daily_version, ordinal, label
      from unnest(array[
        'ตรวจสอบปริมาณของเหลวในถัง',
        'Purge Sheath Filter (Optional)',
        'Daily Clean ก่อนการใช้งาน',
        'Performance QC',
        'Assay and tube setting set up',
        'Daily Clean หลังการใช้งาน',
        'Shutdown'
      ]) with ordinality as rows(label, ordinal);
  end if;

  select coalesce(min(performed_on), equipment_row.installed_on, current_date)
    into start_date
    from public.bm_equipment_routine_maintenance
   where equipment_id = equipment_row.id
     and frequency = 'monthly';

  select id into monthly_form
    from public.bm_equipment_routine_forms
   where equipment_id = equipment_row.id and lower(trim(name)) = lower('Monthly Maintenance');
  if monthly_form is null then
    insert into public.bm_equipment_routine_forms(equipment_id, name, reviewer_id, created_by, updated_by)
    values (equipment_row.id, 'Monthly Maintenance', legacy_reviewer, migration_user, legacy_reviewer)
    returning id into monthly_form;
  end if;
  update public.bm_equipment_routine_forms
     set reviewer_id = coalesce(reviewer_id, legacy_reviewer)
   where id = monthly_form and legacy_reviewer is not null;

  select id into monthly_version
    from public.bm_equipment_routine_form_versions
   where form_id = monthly_form and version_number = 1;
  if monthly_version is null then
    insert into public.bm_equipment_routine_form_versions(form_id, version_number, frequency, starts_on, created_by)
    values (monthly_form, 1, 'monthly', start_date, migration_user)
    returning id into monthly_version;
    insert into public.bm_equipment_routine_form_items(version_id, position, label)
    select monthly_version, ordinal, label
      from unnest(array[
        'Monthly Clean > เทของเสียในถัง Waste ทิ้ง',
        'เปลี่ยน Sheath filter เป็น Bypass',
        'เปลี่ยนสาย Sheath ใส่ลงในถัง FACSClean',
        'ใส่ 2 ml FACSClean ที่ Manual port > Continue',
        'เปลี่ยนสาย Sheath กลับลงในถัง Sheath',
        'ใส่ 3 ml DI water ที่ Manual port > Continue',
        'เปลี่ยน Bypass กลับเป็น Sheath filter',
        'Purge Sheath Filter'
      ]) with ordinality as rows(label, ordinal);
  end if;
end $$;

-- Any legacy row not covered by the FACSLYRIC seed receives a safe generic
-- form/version so the backfill below can make its references mandatory.
do $$
declare
  legacy record;
  form_row uuid;
  version_row uuid;
  item_count integer;
  index_value integer;
  form_name text;
  migration_user uuid;
begin
  select id into migration_user
    from public.nipt_users
   order by is_active desc, id
   limit 1;

  for legacy in
    select equipment_id, frequency, min(performed_on) as first_date,
           greatest(1, max(jsonb_array_length(task_results))) as task_count
      from public.bm_equipment_routine_maintenance
     group by equipment_id, frequency
  loop
    form_name := initcap(legacy.frequency) || ' Maintenance';
    select f.id into form_row
      from public.bm_equipment_routine_forms f
      join public.bm_equipment_routine_form_versions v on v.form_id = f.id
     where f.equipment_id = legacy.equipment_id
       and v.frequency = legacy.frequency
     order by f.created_at
     limit 1;
    if form_row is null then
      insert into public.bm_equipment_routine_forms(equipment_id, name, created_by)
      values (legacy.equipment_id, form_name, migration_user)
      returning id into form_row;
      insert into public.bm_equipment_routine_form_versions(form_id, version_number, frequency, starts_on, created_by)
      values (form_row, 1, legacy.frequency, legacy.first_date, migration_user)
      returning id into version_row;
      item_count := legacy.task_count;
      for index_value in 1..item_count loop
        insert into public.bm_equipment_routine_form_items(version_id, position, label)
        values (version_row, index_value, 'Checklist item ' || index_value);
      end loop;
    end if;
  end loop;
end $$;

-- Reviews can exist for an empty period. Create a minimal migrated form for
-- those rows too, otherwise making form_id mandatory would lose the lock.
do $$
declare
  legacy record;
  form_row uuid;
  version_row uuid;
  migration_user uuid;
begin
  select id into migration_user
    from public.nipt_users
   order by is_active desc, id
   limit 1;

  for legacy in
    select equipment_id, frequency, min(reviewed_at::date) as first_date
      from public.bm_equipment_routine_reviews
     where form_id is null
     group by equipment_id, frequency
  loop
    select f.id into form_row
      from public.bm_equipment_routine_forms f
      join public.bm_equipment_routine_form_versions v on v.form_id = f.id
     where f.equipment_id = legacy.equipment_id
       and v.frequency = legacy.frequency
     order by f.created_at
     limit 1;
    if form_row is null then
      insert into public.bm_equipment_routine_forms(equipment_id, name, created_by)
      values (legacy.equipment_id, initcap(legacy.frequency) || ' Maintenance (migrated)', migration_user)
      returning id into form_row;
      insert into public.bm_equipment_routine_form_versions(form_id, version_number, frequency, starts_on, created_by)
      values (form_row, 1, legacy.frequency, legacy.first_date, migration_user)
      returning id into version_row;
      insert into public.bm_equipment_routine_form_items(version_id, position, label)
      values (version_row, 1, 'Checklist item 1');
    end if;
  end loop;
end $$;

update public.bm_equipment_routine_maintenance entry
   set form_id = version.form_id,
       version_id = version.id,
       planned_on = coalesce(entry.planned_on, entry.performed_on),
       task_results = coalesce(
        (
           select jsonb_agg(
             jsonb_build_object(
                'itemId', item.id,
                'label', item.label,
                'state', case
                  when element.value ->> 'state' in ('done', 'not-applicable', 'not-done')
                    then element.value ->> 'state'
                  else 'not-done'
                end
              ) order by item.position
            )
            from public.bm_equipment_routine_form_items item
            left join jsonb_array_elements(coalesce(entry.task_results, '[]'::jsonb)) with ordinality as element(value, ordinality)
              on item.position = element.ordinality
           where item.version_id = version.id
          ),
         '[]'::jsonb
       )
  from public.bm_equipment_routine_form_versions version
  join public.bm_equipment_routine_forms form on form.id = version.form_id
 where entry.form_id is null
   and form.equipment_id = entry.equipment_id
   and version.frequency = entry.frequency
   and version.version_number = 1;

update public.bm_equipment_routine_holidays holiday
   set form_id = form.id
  from public.bm_equipment_routine_forms form
  join public.bm_equipment_routine_form_versions version on version.form_id = form.id
 where holiday.form_id is null
   and version.version_number = 1
   and version.frequency = 'daily'
   and upper((select code from public.bm_equipment e where e.id = form.equipment_id)) = 'FACSLYRIC';

update public.bm_equipment_routine_reviews review
   set form_id = form.id
  from public.bm_equipment_routine_forms form
  join public.bm_equipment_routine_form_versions version on version.form_id = form.id
 where review.form_id is null
   and form.equipment_id = review.equipment_id
   and version.frequency = review.frequency
   and version.version_number = 1;

alter table public.bm_equipment_routine_holidays
  drop constraint if exists bm_equipment_routine_holidays_form_fk;
alter table public.bm_equipment_routine_holidays
  add constraint bm_equipment_routine_holidays_form_fk
  foreign key (form_id) references public.bm_equipment_routine_forms(id) on delete cascade;

alter table public.bm_equipment_routine_maintenance
  alter column form_id set not null,
  alter column version_id set not null,
  alter column planned_on set not null;
alter table public.bm_equipment_routine_reviews
  alter column form_id set not null;

alter table public.bm_equipment_routine_maintenance
  add constraint bm_equipment_routine_maintenance_form_fk
  foreign key (form_id) references public.bm_equipment_routine_forms(id) on delete cascade,
  add constraint bm_equipment_routine_maintenance_version_fk
  foreign key (version_id) references public.bm_equipment_routine_form_versions(id) on delete restrict;
create unique index if not exists bm_equipment_routine_maintenance_form_occurrence
  on public.bm_equipment_routine_maintenance(form_id, planned_on);
create unique index if not exists bm_equipment_routine_maintenance_idempotency
  on public.bm_equipment_routine_maintenance(idempotency_key)
  where idempotency_key is not null;
create index if not exists bm_equipment_routine_maintenance_form_schedule
  on public.bm_equipment_routine_maintenance(form_id, planned_on desc);

alter table public.bm_equipment_routine_reviews
  add constraint bm_equipment_routine_reviews_form_fk
  foreign key (form_id) references public.bm_equipment_routine_forms(id) on delete cascade;
create unique index if not exists bm_equipment_routine_reviews_form_period
  on public.bm_equipment_routine_reviews(form_id, frequency, period);

alter table public.bm_equipment_routine_forms enable row level security;
alter table public.bm_equipment_routine_form_versions enable row level security;
alter table public.bm_equipment_routine_form_items enable row level security;

drop policy if exists bm_equipment_routine_forms_read on public.bm_equipment_routine_forms;
create policy bm_equipment_routine_forms_read on public.bm_equipment_routine_forms
  for select using (public.current_bm_role() in ('Admin', 'Staff'));
drop policy if exists bm_equipment_routine_form_versions_read on public.bm_equipment_routine_form_versions;
create policy bm_equipment_routine_form_versions_read on public.bm_equipment_routine_form_versions
  for select using (public.current_bm_role() in ('Admin', 'Staff'));
drop policy if exists bm_equipment_routine_form_items_read on public.bm_equipment_routine_form_items;
create policy bm_equipment_routine_form_items_read on public.bm_equipment_routine_form_items
  for select using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_equipment_routine_forms,
  public.bm_equipment_routine_form_versions,
  public.bm_equipment_routine_form_items to authenticated;
grant select, insert, update, delete on public.bm_equipment_routine_forms,
  public.bm_equipment_routine_form_versions,
  public.bm_equipment_routine_form_items to service_role;

notify pgrst, 'reload schema';
