-- Team calendar: several calendars, each with its own entry types, entries,
-- LINE heads-up (optionally to its own LINE group) and phone feed. Public holidays
-- stay shared. Everything that existed so far moves into the default calendar.

create table public.bm_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null and char_length(name) <= 40),
  color_key text not null default 'teal' check (color_key in ('teal', 'rose', 'amber', 'sky', 'violet', 'green', 'orange', 'slate',
                                                              'cyan', 'indigo', 'pink', 'red', 'brown', 'lime')),
  line_group_id text check (line_group_id is null or line_group_id ~ '^[A-Za-z0-9]{10,64}$'),
  is_default boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or is_active)
);

create unique index bm_calendars_name_key on public.bm_calendars (lower(regexp_replace(name, '\s', '', 'g')));
create unique index bm_calendars_one_default on public.bm_calendars (is_default) where is_default;

insert into public.bm_calendars (name, color_key, is_default, sort_order) values ('ปฏิทินทีม', 'teal', true, 10);

/* types belong to a calendar */
alter table public.bm_calendar_types add column calendar_id uuid references public.bm_calendars(id) on delete restrict;
update public.bm_calendar_types set calendar_id = (select id from public.bm_calendars where is_default);
alter table public.bm_calendar_types alter column calendar_id set not null;

drop index if exists public.bm_calendar_types_name_key;
create unique index bm_calendar_types_name_key
  on public.bm_calendar_types (calendar_id, lower(regexp_replace(name, '\s', '', 'g')));
alter table public.bm_calendar_types add constraint bm_calendar_types_id_calendar_key unique (id, calendar_id);

/* entries carry their calendar; the composite key keeps an entry and its type in the same calendar */
alter table public.bm_calendar_events add column calendar_id uuid;
update public.bm_calendar_events e set calendar_id = t.calendar_id from public.bm_calendar_types t where t.id = e.type_id;
alter table public.bm_calendar_events alter column calendar_id set not null;
alter table public.bm_calendar_events
  add constraint bm_calendar_events_type_calendar_fkey
  foreign key (type_id, calendar_id) references public.bm_calendar_types (id, calendar_id) on update cascade on delete restrict;
create index bm_calendar_events_calendar_range
  on public.bm_calendar_events (calendar_id, start_date, end_date) where deleted_at is null;

/* one heads-up per calendar per day */
alter table public.bm_calendar_digest_runs add column calendar_id uuid references public.bm_calendars(id) on delete cascade;
update public.bm_calendar_digest_runs set calendar_id = (select id from public.bm_calendars where is_default);
alter table public.bm_calendar_digest_runs alter column calendar_id set not null;
alter table public.bm_calendar_digest_runs drop constraint bm_calendar_digest_runs_pkey;
alter table public.bm_calendar_digest_runs add primary key (calendar_id, digest_date);

alter table public.bm_calendars enable row level security;
create policy bm_calendars_read on public.bm_calendars
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

revoke all on table public.bm_calendars from public, anon, authenticated;
-- line_group_id is an Admin setting; ordinary sessions read only the safe columns.
grant select (id, name, color_key, is_default, sort_order, is_active, created_at, updated_at) on table public.bm_calendars to authenticated;
grant all on table public.bm_calendars to service_role;

notify pgrst, 'reload schema';
