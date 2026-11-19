-- Team calendar: leave, blood-draw duty and other team entries, plus public holidays,
-- the morning LINE digest ledger and personal phone-calendar (ICS) feed tokens.
-- All writes go through the server (service role); authenticated users only read.

create table public.bm_calendar_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null and char_length(name) <= 40),
  icon_key text not null check (icon_key ~ '^[a-z0-9-]{1,40}$'),
  color_key text not null check (color_key in ('teal', 'rose', 'amber', 'sky', 'violet', 'green', 'orange', 'slate')),
  kind text not null check (kind in ('duty', 'leave', 'other')),
  in_line_digest boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "ลากิจ" and "ลา กิจ" are the same type.
create unique index bm_calendar_types_name_key
  on public.bm_calendar_types (lower(regexp_replace(name, '\s', '', 'g')));

create table public.bm_calendar_events (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.bm_calendar_types(id) on delete restrict,
  user_id uuid not null references public.nipt_users(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  day_part text not null default 'full' check (day_part in ('full', 'am', 'pm')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid not null references public.nipt_users(id),
  updated_by uuid not null references public.nipt_users(id),
  deleted_at timestamptz,
  deleted_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 366),
  check (day_part = 'full' or start_date = end_date),
  check ((deleted_at is null) = (deleted_by is null))
);

create index bm_calendar_events_range on public.bm_calendar_events (start_date, end_date) where deleted_at is null;
create index bm_calendar_events_user on public.bm_calendar_events (user_id, start_date) where deleted_at is null;

create table public.bm_calendar_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null check (nullif(trim(name), '') is not null and char_length(name) <= 200),
  source text not null check (source in ('google', 'manual')),
  source_uid text,
  is_day_off boolean not null default true,
  is_observance boolean not null default false,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'google') = (source_uid is not null))
);

create unique index bm_calendar_holidays_source_uid on public.bm_calendar_holidays (source_uid) where source_uid is not null;
create unique index bm_calendar_holidays_date_name on public.bm_calendar_holidays (holiday_date, name);
create index bm_calendar_holidays_date on public.bm_calendar_holidays (holiday_date);

-- Single-row-per-day ledger so a re-fired cron never posts the digest twice.
create table public.bm_calendar_digest_runs (
  digest_date date primary key,
  status text not null check (status in ('sending', 'sent', 'skipped', 'failed')),
  message text,
  recipients_hint integer,
  attempts integer not null default 1,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);

create table public.bm_calendar_settings (
  id boolean primary key default true check (id),
  holidays_synced_at timestamptz,
  holidays_sync_error text,
  updated_at timestamptz not null default now()
);
insert into public.bm_calendar_settings (id) values (true);

-- Secret per-user token for the read-only ICS feed (calendar apps cannot log in).
create table public.bm_calendar_feed_tokens (
  user_id uuid primary key references public.nipt_users(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32,}$'),
  created_at timestamptz not null default now()
);

insert into public.bm_calendar_types (name, icon_key, color_key, kind, in_line_digest, sort_order) values
  ('เวรเจาะเลือด', 'drop', 'rose', 'duty', true, 10),
  ('ลากิจ', 'briefcase', 'amber', 'leave', true, 20),
  ('ลาป่วย', 'thermometer', 'orange', 'leave', true, 30),
  ('ลาพักร้อน', 'umbrella', 'sky', 'leave', true, 40);

alter table public.bm_calendar_types enable row level security;
alter table public.bm_calendar_events enable row level security;
alter table public.bm_calendar_holidays enable row level security;
alter table public.bm_calendar_digest_runs enable row level security;
alter table public.bm_calendar_settings enable row level security;
alter table public.bm_calendar_feed_tokens enable row level security;

create policy bm_calendar_types_read on public.bm_calendar_types
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_calendar_events_read on public.bm_calendar_events
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff') and deleted_at is null);
create policy bm_calendar_holidays_read on public.bm_calendar_holidays
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

revoke all on table public.bm_calendar_types, public.bm_calendar_events, public.bm_calendar_holidays,
  public.bm_calendar_digest_runs, public.bm_calendar_settings, public.bm_calendar_feed_tokens
  from public, anon, authenticated;
grant select on table public.bm_calendar_types, public.bm_calendar_events, public.bm_calendar_holidays to authenticated;
grant all on table public.bm_calendar_types, public.bm_calendar_events, public.bm_calendar_holidays,
  public.bm_calendar_digest_runs, public.bm_calendar_settings, public.bm_calendar_feed_tokens
  to service_role;

notify pgrst, 'reload schema';
