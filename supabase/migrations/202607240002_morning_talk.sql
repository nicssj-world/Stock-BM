-- Morning Talk: assigned attendees acknowledge each daily briefing themselves.

create table public.morning_talks (
  id uuid primary key default gen_random_uuid(),
  talk_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  title text not null check (nullif(trim(title), '') is not null),
  agenda text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index morning_talks_date on public.morning_talks(talk_date desc, created_at desc);

create table public.morning_talk_attendees (
  talk_id uuid not null references public.morning_talks(id) on delete cascade,
  user_id uuid not null references public.nipt_users(id),
  acknowledged_at timestamptz,
  assigned_at timestamptz not null default now(),
  primary key (talk_id, user_id)
);

create index morning_talk_attendees_user on public.morning_talk_attendees(user_id, acknowledged_at);

alter table public.morning_talks enable row level security;
alter table public.morning_talk_attendees enable row level security;

create policy morning_talks_read on public.morning_talks for select using (public.current_bm_role() is not null);
create policy morning_talk_attendees_read on public.morning_talk_attendees for select using (public.current_bm_role() is not null);

grant select on public.morning_talks, public.morning_talk_attendees to authenticated;
grant select, insert, update, delete on public.morning_talks, public.morning_talk_attendees to service_role;
