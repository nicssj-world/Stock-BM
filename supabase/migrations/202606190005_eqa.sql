-- EQA (External Quality Assessment / proficiency testing). Files (certificates,
-- sample-receipt forms, annual summaries) use the shared bm_attachments table.

create table public.eqa_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (nullif(trim(name), '') is not null),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.eqa_schemes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.eqa_providers(id),
  name text not null check (nullif(trim(name), '') is not null),
  code text,
  analyte_scope text,
  rounds_per_year integer check (rounds_per_year is null or rounds_per_year > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.eqa_rounds (
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.eqa_schemes(id),
  round_label text not null check (nullif(trim(round_label), '') is not null),
  sample_received_date date,
  result_due_date date,
  submission_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'received', 'submitted', 'evaluated', 'closed')),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.eqa_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.eqa_rounds(id) on delete cascade,
  analyte text not null check (nullif(trim(analyte), '') is not null),
  submitted_value text,
  evaluation_score numeric,
  outcome text not null default 'not-evaluated' check (outcome in ('acceptable', 'warning', 'unacceptable', 'not-evaluated')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.eqa_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.eqa_rounds(id),
  result_id uuid references public.eqa_results(id),
  problem text not null check (nullif(trim(problem), '') is not null),
  root_cause text,
  action_taken text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.nipt_users(id),
  closed_at timestamptz
);

create index eqa_schemes_provider on public.eqa_schemes(provider_id);
create index eqa_rounds_scheme on public.eqa_rounds(scheme_id);
create index eqa_rounds_due on public.eqa_rounds(result_due_date);
create index eqa_results_round on public.eqa_results(round_id);
create index eqa_corrective_actions_round on public.eqa_corrective_actions(round_id);

alter table public.eqa_providers enable row level security;
alter table public.eqa_schemes enable row level security;
alter table public.eqa_rounds enable row level security;
alter table public.eqa_results enable row level security;
alter table public.eqa_corrective_actions enable row level security;

create policy eqa_providers_read on public.eqa_providers for select using (public.current_bm_role() is not null);
create policy eqa_schemes_read on public.eqa_schemes for select using (public.current_bm_role() is not null);
create policy eqa_rounds_read on public.eqa_rounds for select using (public.current_bm_role() is not null);
create policy eqa_results_read on public.eqa_results for select using (public.current_bm_role() is not null);
create policy eqa_corrective_actions_read on public.eqa_corrective_actions for select using (public.current_bm_role() is not null);
