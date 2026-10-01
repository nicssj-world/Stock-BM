-- Monthly recurring work: templates generate one independently trackable task per month.

create table public.bm_monthly_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (nullif(trim(title), '') is not null),
  assignee_id uuid not null references public.nipt_users(id) on delete restrict,
  due_day smallint not null check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_monthly_task_templates_active on public.bm_monthly_task_templates(is_active, due_day, created_at);
create index bm_monthly_task_templates_assignee on public.bm_monthly_task_templates(assignee_id, is_active);

create table public.bm_monthly_task_occurrences (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.bm_monthly_task_templates(id) on delete restrict,
  task_month date not null check (extract(day from task_month) = 1),
  title text not null check (nullif(trim(title), '') is not null),
  assignee_id uuid not null references public.nipt_users(id) on delete restrict,
  deadline date not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.nipt_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, task_month),
  check (deadline >= task_month and deadline < (task_month + interval '1 month')::date),
  check (is_completed = (completed_at is not null)),
  check ((completed_at is null) = (completed_by is null))
);

create index bm_monthly_task_occurrences_month on public.bm_monthly_task_occurrences(task_month, is_completed, deadline);
create index bm_monthly_task_occurrences_assignee on public.bm_monthly_task_occurrences(assignee_id, task_month, is_completed);

alter table public.bm_monthly_task_templates enable row level security;
alter table public.bm_monthly_task_occurrences enable row level security;

create policy bm_monthly_task_templates_read on public.bm_monthly_task_templates
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

create policy bm_monthly_task_occurrences_read on public.bm_monthly_task_occurrences
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

revoke all on table public.bm_monthly_task_templates from public, anon, authenticated;
revoke all on table public.bm_monthly_task_occurrences from public, anon, authenticated;
grant select on table public.bm_monthly_task_templates, public.bm_monthly_task_occurrences to authenticated;
grant all on table public.bm_monthly_task_templates, public.bm_monthly_task_occurrences to service_role;

notify pgrst, 'reload schema';
