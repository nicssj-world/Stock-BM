-- Controlled daily/monthly BD FACSLyric maintenance checklists.
create table public.bm_equipment_routine_maintenance (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'monthly')),
  performed_on date not null,
  task_results jsonb not null,
  note text,
  operator_id uuid not null references public.nipt_users(id),
  operator_name text not null,
  operator_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_id, frequency, performed_on)
);
create index bm_equipment_routine_maintenance_period on public.bm_equipment_routine_maintenance(equipment_id, frequency, performed_on desc);

create table public.bm_equipment_routine_holidays (
  date date primary key,
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.bm_equipment_routine_reviewers (
  equipment_id uuid primary key references public.bm_equipment(id) on delete cascade,
  reviewer_id uuid not null references public.nipt_users(id),
  updated_by uuid not null references public.nipt_users(id),
  updated_at timestamptz not null default now()
);

create table public.bm_equipment_routine_reviews (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'monthly')),
  period text not null check (period ~ '^\d{4}(-\d{2})?$'),
  reviewed_by uuid not null references public.nipt_users(id),
  reviewed_at timestamptz not null default now(),
  unique (equipment_id, frequency, period)
);

alter table public.bm_equipment_routine_maintenance enable row level security;
alter table public.bm_equipment_routine_holidays enable row level security;
alter table public.bm_equipment_routine_reviewers enable row level security;
alter table public.bm_equipment_routine_reviews enable row level security;
create policy bm_equipment_routine_maintenance_read on public.bm_equipment_routine_maintenance for select using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_routine_holidays_read on public.bm_equipment_routine_holidays for select using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_routine_reviewers_read on public.bm_equipment_routine_reviewers for select using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_routine_reviews_read on public.bm_equipment_routine_reviews for select using (public.current_bm_role() in ('Admin', 'Staff'));
grant select on public.bm_equipment_routine_maintenance, public.bm_equipment_routine_holidays, public.bm_equipment_routine_reviewers, public.bm_equipment_routine_reviews to authenticated;
grant select, insert, update, delete on public.bm_equipment_routine_maintenance, public.bm_equipment_routine_holidays, public.bm_equipment_routine_reviewers, public.bm_equipment_routine_reviews to service_role;
