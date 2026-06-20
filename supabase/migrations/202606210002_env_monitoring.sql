-- Temperature / Environment monitoring. Daily readings for fridges/freezers/rooms,
-- bound (optionally) to a stock storage location so cold-chain QC sits next to the
-- reagents Stock already tracks. Each unit carries min/max limits + a QR token; a
-- sticker on the unit deep-links to /environment/u/<token> for fast mobile entry.
-- Reuses nipt_users + current_bm_role() for auth; writes via service-role only.

create table public.env_monitored_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  kind text not null default 'fridge' check (kind in ('fridge', 'freezer', 'room', 'incubator', 'other')),
  location_id uuid references public.bm_stock_locations(id),
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  min_limit numeric,
  max_limit numeric,
  unit text not null default '°C',
  readings_per_day integer not null default 1 check (readings_per_day > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_limit is null or max_limit is null or min_limit <= max_limit)
);

-- One reading per unit per day (once-daily). status is computed server-side against
-- the unit's min/max limits; recorded_min/max are optional min-max thermometer values.
create table public.env_readings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.env_monitored_units(id) on delete cascade,
  reading_date date not null,
  reading_value numeric not null,
  recorded_min numeric,
  recorded_max numeric,
  status text not null default 'in-range' check (status in ('in-range', 'out-of-range', 'corrected')),
  is_voided boolean not null default false,
  void_reason text,
  note text,
  recorded_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (unit_id, reading_date)
);

-- Corrective action for an out-of-range reading (mirrors iqc_corrective_actions).
-- Files (e.g. evidence) attach through bm_attachments with module = 'env'.
create table public.env_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.env_readings(id) on delete cascade,
  problem text not null check (nullif(trim(problem), '') is not null),
  root_cause text,
  action_taken text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.nipt_users(id),
  closed_at timestamptz
);

create index env_readings_unit_date on public.env_readings(unit_id, reading_date desc);
create index env_corrective_actions_reading on public.env_corrective_actions(reading_id);

alter table public.env_monitored_units enable row level security;
alter table public.env_readings enable row level security;
alter table public.env_corrective_actions enable row level security;

create policy env_monitored_units_read on public.env_monitored_units for select using (public.current_bm_role() is not null);
create policy env_readings_read on public.env_readings for select using (public.current_bm_role() is not null);
create policy env_corrective_actions_read on public.env_corrective_actions for select using (public.current_bm_role() is not null);
