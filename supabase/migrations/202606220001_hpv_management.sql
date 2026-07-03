-- HPV Management: site kit distribution and sample storage workflows.
-- Uses the BM stock ledger for central stock deduction.

create table public.bm_hpv_sites (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null unique check (nullif(trim(name), '') is not null),
  site_type text not null default 'รพ.สต.',
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bm_hpv_kit_distributions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.bm_hpv_sites(id),
  distributed_on date not null default ((now() at time zone 'Asia/Bangkok')::date),
  quantity integer not null check (quantity > 0),
  stock_lot_id uuid not null references public.bm_stock_lots(id),
  stock_location_id uuid not null references public.bm_stock_locations(id),
  stock_transaction_id uuid not null unique references public.bm_stock_transactions(id),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.bm_hpv_site_receipts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.bm_hpv_sites(id),
  received_on date not null default ((now() at time zone 'Asia/Bangkok')::date),
  sample_count integer not null check (sample_count > 0),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table public.bm_hpv_storage_boxes (
  id uuid primary key default gen_random_uuid(),
  box_code text not null unique check (nullif(trim(box_code), '') is not null),
  box_type text not null check (box_type in ('self_collected', 'clinician_collected')),
  capacity integer not null default 25 check (capacity = 25),
  status text not null default 'open' check (status in ('open', 'full', 'destroyed')),
  filled_at timestamptz,
  destroy_due_at timestamptz,
  destroyed_at timestamptz,
  destroyed_by uuid references public.nipt_users(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'full') = (filled_at is not null and destroy_due_at is not null) or status in ('open', 'destroyed'))
);

create table public.bm_hpv_samples (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique check (nullif(trim(barcode), '') is not null),
  box_id uuid not null references public.bm_hpv_storage_boxes(id),
  position integer not null check (position between 1 and 25),
  status text not null default 'stored' check (status in ('stored', 'checked_out', 'destroyed')),
  stored_at timestamptz not null default now(),
  stored_by uuid not null references public.nipt_users(id),
  checked_out_at timestamptz,
  checked_out_by uuid references public.nipt_users(id),
  checkout_destination text,
  checkout_note text,
  destroyed_at timestamptz,
  destroyed_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (box_id, position)
);

create index bm_hpv_sites_active on public.bm_hpv_sites(is_active, name);
create index bm_hpv_kit_distributions_site_date on public.bm_hpv_kit_distributions(site_id, distributed_on desc);
create index bm_hpv_site_receipts_site_date on public.bm_hpv_site_receipts(site_id, received_on desc);
create index bm_hpv_storage_boxes_status_type on public.bm_hpv_storage_boxes(status, box_type, created_at desc);
create index bm_hpv_storage_boxes_destroy_due on public.bm_hpv_storage_boxes(destroy_due_at);
create index bm_hpv_samples_box_position on public.bm_hpv_samples(box_id, position);
create index bm_hpv_samples_status on public.bm_hpv_samples(status, stored_at desc);

alter table public.bm_hpv_sites enable row level security;
alter table public.bm_hpv_kit_distributions enable row level security;
alter table public.bm_hpv_site_receipts enable row level security;
alter table public.bm_hpv_storage_boxes enable row level security;
alter table public.bm_hpv_samples enable row level security;

create policy bm_hpv_sites_active_read on public.bm_hpv_sites
for select using (public.current_bm_role() is not null);

create policy bm_hpv_kit_distributions_active_read on public.bm_hpv_kit_distributions
for select using (public.current_bm_role() is not null);

create policy bm_hpv_site_receipts_active_read on public.bm_hpv_site_receipts
for select using (public.current_bm_role() is not null);

create policy bm_hpv_storage_boxes_active_read on public.bm_hpv_storage_boxes
for select using (public.current_bm_role() is not null);

create policy bm_hpv_samples_active_read on public.bm_hpv_samples
for select using (public.current_bm_role() is not null);
