-- Minimal stand-ins for the shared Genomic-CBH identity dependency.
-- These objects exist in the production Supabase project but are intentionally
-- not owned by this repository. The fixture is loaded before local migrations.

create table if not exists public.nipt_users (
  id uuid primary key,
  ephis_id text not null unique,
  display_name text not null,
  role text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.nipt_users (id, ephis_id, display_name, role, is_active)
values ('00000000-0000-0000-0000-000000000001', 'HARNESS-ADMIN', 'Stock Harness Admin', 'Admin', true)
on conflict (id) do nothing;
