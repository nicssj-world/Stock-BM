-- Morning Talk follow-up: shared daily checklist and accountable action items.

create table public.morning_talk_checklist_items (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references public.morning_talks(id) on delete cascade,
  title text not null check (nullif(trim(title), '') is not null),
  sort_order integer not null default 0 check (sort_order >= 0),
  completed_at timestamptz,
  completed_by uuid references public.nipt_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((completed_at is null) = (completed_by is null))
);

create index morning_talk_checklist_items_talk on public.morning_talk_checklist_items(talk_id, sort_order, created_at);

create table public.morning_talk_action_items (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references public.morning_talks(id) on delete cascade,
  title text not null check (nullif(trim(title), '') is not null),
  owner_id uuid references public.nipt_users(id) on delete set null,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in-progress', 'done')),
  note text,
  completed_at timestamptz,
  completed_by uuid references public.nipt_users(id) on delete set null,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null)),
  check ((completed_at is null) = (completed_by is null))
);

create index morning_talk_action_items_talk on public.morning_talk_action_items(talk_id, status, due_date);
create index morning_talk_action_items_open_due on public.morning_talk_action_items(due_date) where status <> 'done';

alter table public.morning_talk_checklist_items enable row level security;
alter table public.morning_talk_action_items enable row level security;

create policy morning_talk_checklist_items_read on public.morning_talk_checklist_items for select using (public.current_bm_role() is not null);
create policy morning_talk_action_items_read on public.morning_talk_action_items for select using (public.current_bm_role() is not null);

grant select on public.morning_talk_checklist_items, public.morning_talk_action_items to authenticated;
grant select, insert, update, delete on public.morning_talk_checklist_items, public.morning_talk_action_items to service_role;
