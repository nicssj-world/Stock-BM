-- Receiving is dark-launched. Both controls remain off until the governed
-- policy decisions are approved in the target environment.

create table if not exists public.bm_receiving_policies (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  is_enabled boolean not null default false,
  expiry_exception_enabled boolean not null default false,
  expiry_exception_min_role text,
  expiry_exception_requires_second_approval boolean,
  is_approved boolean not null default false,
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

insert into public.bm_receiving_policies(
  version, is_enabled, expiry_exception_enabled, expiry_exception_min_role,
  expiry_exception_requires_second_approval, is_approved, created_by
)
values (1, false, false, null, null, false, (select users.id from public.nipt_users as users order by users.id limit 1))
on conflict (version) do nothing;

alter table public.bm_receiving_policies enable row level security;
create policy bm_receiving_policies_active_read on public.bm_receiving_policies
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_receiving_policies from public, anon, authenticated;
grant all on table public.bm_receiving_policies to service_role;

notify pgrst, 'reload schema';
