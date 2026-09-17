-- Vendor master and the reviewed item-to-vendor mapping used by receiving.
-- bm_stock_items.supplier remains legacy free text and is not backfilled.

create table if not exists public.bm_vendors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  tax_id text,
  address text,
  phone text,
  email text,
  contact_person text,
  is_active boolean not null default true,
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bm_stock_item_vendors (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade,
  vendor_id uuid not null references public.bm_vendors(id) on delete cascade,
  vendor_catalog_no text,
  is_preferred boolean not null default false,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (stock_item_id, vendor_id)
);

create index if not exists bm_stock_item_vendors_vendor
  on public.bm_stock_item_vendors(vendor_id);

alter table public.bm_vendors enable row level security;
create policy bm_vendors_active_read on public.bm_vendors
for select using (public.current_bm_role() is not null);

alter table public.bm_stock_item_vendors enable row level security;
create policy bm_stock_item_vendors_active_read on public.bm_stock_item_vendors
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_vendors from public, anon, authenticated;
grant all on table public.bm_vendors to service_role;
revoke all on table public.bm_stock_item_vendors from public, anon, authenticated;
grant all on table public.bm_stock_item_vendors to service_role;

notify pgrst, 'reload schema';
