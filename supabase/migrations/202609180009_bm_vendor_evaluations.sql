-- Phase 4 annual vendor evaluation documents. Policy JSON is deliberately
-- empty and unapproved until P-13/P-14 are decided; result stays null.

create table if not exists public.bm_vendor_eval_policies (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  weights jsonb not null default '{}'::jsonb,
  score_formulas jsonb not null default '{}'::jsonb,
  result_thresholds jsonb not null default '{}'::jsonb,
  is_approved boolean not null default false,
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

insert into public.bm_vendor_eval_policies(version, created_by)
values (1, (select users.id from public.nipt_users as users order by users.id limit 1))
on conflict (version) do nothing;

create table if not exists public.bm_vendor_evaluations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id),
  fiscal_year text not null check (fiscal_year ~ '^[0-9]{4}$'),
  revision integer not null default 1 check (revision > 0),
  metrics_snapshot jsonb not null,
  judgment jsonb not null default '{}'::jsonb,
  significant_events_snapshot jsonb not null default '[]'::jsonb,
  policy_id uuid references public.bm_vendor_eval_policies(id),
  result numeric,
  result_label text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, fiscal_year)
);

create table if not exists public.bm_vendor_eval_document_states (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.bm_vendor_evaluations(id) on delete cascade,
  revision integer not null check (revision > 0),
  status text not null default 'draft' check (status in ('draft','approved')),
  updated_at timestamptz not null default now(),
  unique (evaluation_id)
);

create table if not exists public.bm_vendor_eval_approvals (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.bm_vendor_evaluations(id) on delete cascade,
  revision integer not null check (revision > 0),
  approval_role text not null check (approval_role in ('evaluator','reviewer','approver')),
  approved_by uuid not null references public.nipt_users(id),
  approved_at timestamptz not null default now(),
  signer_name text,
  signature_attachment_id uuid references public.bm_attachments(id) on delete set null,
  unique (evaluation_id, revision, approval_role)
);

create table if not exists public.bm_vendor_eval_approver_assignments (
  approval_role text primary key check (approval_role in ('evaluator','reviewer','approver')),
  user_id uuid not null references public.nipt_users(id),
  updated_by uuid not null references public.nipt_users(id),
  updated_at timestamptz not null default now()
);

create index if not exists bm_vendor_evaluations_vendor_year
  on public.bm_vendor_evaluations(vendor_id, fiscal_year desc);
create index if not exists bm_vendor_eval_approvals_current
  on public.bm_vendor_eval_approvals(evaluation_id, revision);

alter table public.bm_vendor_eval_policies enable row level security;
alter table public.bm_vendor_evaluations enable row level security;
alter table public.bm_vendor_eval_document_states enable row level security;
alter table public.bm_vendor_eval_approvals enable row level security;
alter table public.bm_vendor_eval_approver_assignments enable row level security;

create policy bm_vendor_eval_policies_active_read on public.bm_vendor_eval_policies
for select using (public.current_bm_role() is not null);
create policy bm_vendor_evaluations_active_read on public.bm_vendor_evaluations
for select using (public.current_bm_role() is not null);
create policy bm_vendor_eval_document_states_active_read on public.bm_vendor_eval_document_states
for select using (public.current_bm_role() is not null);
create policy bm_vendor_eval_approvals_active_read on public.bm_vendor_eval_approvals
for select using (public.current_bm_role() is not null);
create policy bm_vendor_eval_approver_assignments_active_read on public.bm_vendor_eval_approver_assignments
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_vendor_eval_policies from public, anon, authenticated;
grant all on table public.bm_vendor_eval_policies to service_role;
revoke all on table public.bm_vendor_evaluations from public, anon, authenticated;
grant all on table public.bm_vendor_evaluations to service_role;
revoke all on table public.bm_vendor_eval_document_states from public, anon, authenticated;
grant all on table public.bm_vendor_eval_document_states to service_role;
revoke all on table public.bm_vendor_eval_approvals from public, anon, authenticated;
grant all on table public.bm_vendor_eval_approvals to service_role;
revoke all on table public.bm_vendor_eval_approver_assignments from public, anon, authenticated;
grant all on table public.bm_vendor_eval_approver_assignments to service_role;

notify pgrst, 'reload schema';
