-- Additive barcode identity tables for the new receiving/scanner flow.
-- Legacy bm_stock_items.manufacturer_barcode and
-- bm_stock_lots.manufacturer_barcode remain unchanged.

create table if not exists public.bm_stock_item_barcodes (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade,
  barcode text not null check (nullif(trim(barcode), '') is not null),
  symbology text,
  standard text,
  pack_description text,
  is_primary boolean not null default false,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (stock_item_id, barcode)
);

create index if not exists bm_stock_item_barcodes_barcode
on public.bm_stock_item_barcodes(barcode);

create table if not exists public.bm_stock_lot_barcodes (
  id uuid primary key default gen_random_uuid(),
  stock_lot_id uuid not null references public.bm_stock_lots(id) on delete cascade,
  barcode text not null check (nullif(trim(barcode), '') is not null),
  symbology text,
  standard text,
  raw_payload text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (stock_lot_id, barcode)
);

create index if not exists bm_stock_lot_barcodes_barcode
on public.bm_stock_lot_barcodes(barcode);

alter table public.bm_stock_item_barcodes enable row level security;
create policy bm_stock_item_barcodes_active_read on public.bm_stock_item_barcodes
for select using (public.current_bm_role() is not null);

alter table public.bm_stock_lot_barcodes enable row level security;
create policy bm_stock_lot_barcodes_active_read on public.bm_stock_lot_barcodes
for select using (public.current_bm_role() is not null);

-- Backfill is insert-only and idempotent. The legacy source columns and their
-- existing unique indexes are deliberately not updated or relaxed.
insert into public.bm_stock_item_barcodes(stock_item_id, barcode, standard, created_by)
select id, manufacturer_barcode, 'legacy', created_by
from public.bm_stock_items
where manufacturer_barcode is not null
on conflict (stock_item_id, barcode) do nothing;

insert into public.bm_stock_lot_barcodes(stock_lot_id, barcode, standard, created_by)
select id, manufacturer_barcode, 'legacy', created_by
from public.bm_stock_lots
where manufacturer_barcode is not null
on conflict (stock_lot_id, barcode) do nothing;

notify pgrst, 'reload schema';
