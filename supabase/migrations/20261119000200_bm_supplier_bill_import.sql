-- Supplier Bill (.xlsx) import for receiving (same file format as CHEM-IMMUNO-QMS).
-- 1) Receipts created from an imported Bill are recorded with source 'import'.
-- 2) Remembered supplier code → Item Master mappings (RDTH Code / Material No.),
--    scoped per Vendor. Admin mappings are approved at once; Staff mappings wait
--    for Admin approval and are never used for matching until approved.
-- All writes go through the server (service role); authenticated users only read.

create table public.bm_supplier_item_codes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id) on delete restrict,
  code_kind text not null check (code_kind in ('rdth', 'material')),
  code_raw text not null check (nullif(trim(code_raw), '') is not null and char_length(code_raw) <= 120),
  code_normalized text not null check (code_normalized ~ '^[A-Z0-9]{1,120}$'),
  stock_item_id uuid not null references public.bm_stock_items(id) on delete restrict,
  description_text text check (description_text is null or char_length(description_text) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  requested_by uuid not null references public.nipt_users(id),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.nipt_users(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null)),
  check ((reviewed_by is null) = (reviewed_at is null))
);

-- One live (pending or approved) mapping per Vendor + code.
create unique index bm_supplier_item_codes_live_key
  on public.bm_supplier_item_codes (vendor_id, code_kind, code_normalized)
  where status in ('pending', 'approved');
create index bm_supplier_item_codes_vendor on public.bm_supplier_item_codes (vendor_id, status);

alter table public.bm_supplier_item_codes enable row level security;

create policy bm_supplier_item_codes_read on public.bm_supplier_item_codes
for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

revoke all on table public.bm_supplier_item_codes from public, anon, authenticated;
grant select on table public.bm_supplier_item_codes to authenticated;
grant all on table public.bm_supplier_item_codes to service_role;

-- Kept last on purpose: see supabase/migrations/no-live-object-changes.test.ts.
alter table public.bm_receipts drop constraint if exists bm_receipts_source_check;
alter table public.bm_receipts add constraint bm_receipts_source_check
  check (source in ('manual','ocr','scan','import'));

notify pgrst, 'reload schema';
