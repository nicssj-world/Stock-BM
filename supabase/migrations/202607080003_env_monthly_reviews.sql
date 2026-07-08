-- Monthly review/lock for temperature monitoring reports.

create table if not exists public.env_monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.env_monitored_units(id) on delete cascade,
  year_month text not null check (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  note text,
  reviewed_by uuid not null references public.nipt_users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, year_month)
);

create index if not exists env_monthly_reviews_unit_month
  on public.env_monthly_reviews(unit_id, year_month desc);

alter table public.env_monthly_reviews enable row level security;

drop policy if exists env_monthly_reviews_read on public.env_monthly_reviews;
create policy env_monthly_reviews_read on public.env_monthly_reviews
  for select
  using (public.current_bm_role() is not null);
