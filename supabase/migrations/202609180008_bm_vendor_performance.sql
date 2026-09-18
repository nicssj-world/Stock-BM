-- Phase 3 evidence capture. These tables do not change the stock ledger or
-- calculate an evaluation result. P-12 remains intentionally unapproved: an empty
-- mapping table is safer than guessing which storage conditions are cold-chain.

create table if not exists public.bm_receiving_cold_chain_mappings (
  id uuid primary key default gen_random_uuid(),
  storage_condition text not null unique check (nullif(trim(storage_condition), '') is not null),
  is_applicable boolean not null,
  is_approved boolean not null default false,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz
);

create table if not exists public.bm_vendor_issues (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id),
  receipt_id uuid references public.bm_receipts(id),
  receipt_line_id uuid references public.bm_receipt_lines(id),
  issue_type text not null check (issue_type in (
    'complaint',
    'documentation_discrepancy',
    'packaging_damage',
    'temperature_out_of_range',
    'quantity_discrepancy',
    'expiry_non_compliant',
    'other'
  )),
  description text not null check (nullif(trim(description), '') is not null),
  resolution_status text not null default 'open' check (resolution_status in ('open','resolved','cancelled')),
  resolution_note text,
  opened_by uuid not null references public.nipt_users(id),
  opened_at timestamptz not null default now(),
  resolved_by uuid references public.nipt_users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bm_vendor_issue_resolution_fields check (
    resolution_status = 'open'
    or (resolved_by is not null and resolved_at is not null)
  )
);

create table if not exists public.bm_vendor_significant_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id),
  event_type text not null check (nullif(trim(event_type), '') is not null),
  severity text not null default 'significant' check (severity in ('significant','critical')),
  event_date date not null,
  description text not null check (nullif(trim(description), '') is not null),
  receipt_id uuid references public.bm_receipts(id),
  issue_id uuid references public.bm_vendor_issues(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create index if not exists bm_vendor_issues_vendor_opened
  on public.bm_vendor_issues(vendor_id, opened_at desc);
create index if not exists bm_vendor_issues_receipt
  on public.bm_vendor_issues(receipt_id);
create index if not exists bm_vendor_significant_events_vendor_date
  on public.bm_vendor_significant_events(vendor_id, event_date desc);
create index if not exists bm_vendor_significant_events_issue
  on public.bm_vendor_significant_events(issue_id);

alter table public.bm_receiving_cold_chain_mappings enable row level security;
create policy bm_receiving_cold_chain_mappings_active_read on public.bm_receiving_cold_chain_mappings
for select using (public.current_bm_role() is not null);

alter table public.bm_vendor_issues enable row level security;
create policy bm_vendor_issues_active_read on public.bm_vendor_issues
for select using (public.current_bm_role() is not null);

alter table public.bm_vendor_significant_events enable row level security;
create policy bm_vendor_significant_events_active_read on public.bm_vendor_significant_events
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_receiving_cold_chain_mappings from public, anon, authenticated;
grant all on table public.bm_receiving_cold_chain_mappings to service_role;
revoke all on table public.bm_vendor_issues from public, anon, authenticated;
grant all on table public.bm_vendor_issues to service_role;
revoke all on table public.bm_vendor_significant_events from public, anon, authenticated;
grant all on table public.bm_vendor_significant_events to service_role;

notify pgrst, 'reload schema';
