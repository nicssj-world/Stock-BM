-- Receiving event records. These tables describe receipts and expectations;
-- the existing append-only BM stock ledger remains the only balance system.

create table if not exists public.bm_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.bm_vendors(id),
  invoice_no text,
  invoice_date date,
  status text not null default 'draft' check (status in ('draft','open','closed','cancelled')),
  source text not null default 'manual' check (source in ('manual','ocr')),
  ocr_job_id uuid,
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bm_invoices_vendor_no
  on public.bm_invoices(vendor_id, invoice_no)
  where invoice_no is not null;

create table if not exists public.bm_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.bm_invoices(id) on delete cascade,
  line_no integer not null,
  stock_item_id uuid references public.bm_stock_items(id),
  catalog_no_text text,
  description_text text,
  expected_qty numeric(14,3) not null check (expected_qty > 0),
  lot_text text,
  expiry_text text,
  match_method text check (match_method is null or match_method in ('exact_unique','exact_ambiguous','similar','manual','unmatched')),
  match_confidence numeric,
  closure_state text not null default 'open' check (closure_state in ('open','complete','short_closed','cancelled')),
  short_reason_code text,
  short_reason_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_no)
);

create table if not exists public.bm_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique,
  invoice_id uuid references public.bm_invoices(id),
  vendor_id uuid not null references public.bm_vendors(id),
  received_at timestamptz not null default now(),
  received_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  received_by uuid not null references public.nipt_users(id),
  packaging_status text check (packaging_status is null or packaging_status in ('acceptable','damaged','not_applicable')),
  packaging_note text,
  temperature_status text check (temperature_status is null or temperature_status in ('acceptable','out_of_range','not_applicable')),
  temperature_value_c numeric,
  temperature_note text,
  cold_chain_applicable boolean not null default false,
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  stock_transaction_id uuid unique references public.bm_stock_transactions(id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.nipt_users(id),
  source text not null default 'manual' check (source in ('manual','ocr','scan')),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bm_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.bm_receipts(id) on delete cascade,
  line_no integer not null,
  invoice_line_id uuid references public.bm_invoice_lines(id),
  stock_item_id uuid not null references public.bm_stock_items(id),
  stock_lot_id uuid references public.bm_stock_lots(id),
  lot_number text,
  expiry_date date,
  lot_mode text not null default 'new' check (lot_mode in ('existing','new','not_tracked')),
  location_id uuid not null references public.bm_stock_locations(id),
  expected_qty numeric(14,3),
  received_qty numeric(14,3) not null check (received_qty > 0),
  barcode_raw text,
  barcode_symbology text,
  barcode_standard text,
  barcode_gtin text,
  barcode_lot text,
  barcode_expiry date,
  tor_threshold_months integer not null default 6 check (tor_threshold_months > 0),
  tor_expiry_compliance text not null default 'not_applicable'
    check (tor_expiry_compliance in ('compliant','not_compliant','not_applicable')),
  remaining_shelf_life_days integer,
  receipt_decision text not null default 'accepted'
    check (receipt_decision in ('accepted','accepted_with_justification')),
  acceptance_reason_code text check (acceptance_reason_code is null or acceptance_reason_code in
    ('urgent_need','consume_before_expiry','no_alternative','approved_by_authority','other')),
  acceptance_reason_note text,
  accepted_by uuid references public.nipt_users(id),
  accepted_at timestamptz,
  conflicts jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_no),

  constraint bm_receipt_lines_justification_required check (
    tor_expiry_compliance <> 'not_compliant'
    or receipt_decision = 'accepted_with_justification'
  ),
  constraint bm_receipt_lines_justification_reason check (
    receipt_decision <> 'accepted_with_justification'
    or (acceptance_reason_code is not null
        and (acceptance_reason_code <> 'other'
             or nullif(trim(coalesce(acceptance_reason_note,'')),'') is not null))
  )
);

create index if not exists bm_invoice_lines_invoice on public.bm_invoice_lines(invoice_id, sort_order);
create index if not exists bm_receipts_vendor_date on public.bm_receipts(vendor_id, received_date desc);
create index if not exists bm_receipt_lines_receipt on public.bm_receipt_lines(receipt_id, sort_order);

alter table public.bm_invoices enable row level security;
create policy bm_invoices_active_read on public.bm_invoices
for select using (public.current_bm_role() is not null);

alter table public.bm_invoice_lines enable row level security;
create policy bm_invoice_lines_active_read on public.bm_invoice_lines
for select using (public.current_bm_role() is not null);

alter table public.bm_receipts enable row level security;
create policy bm_receipts_active_read on public.bm_receipts
for select using (public.current_bm_role() is not null);

alter table public.bm_receipt_lines enable row level security;
create policy bm_receipt_lines_active_read on public.bm_receipt_lines
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_invoices from public, anon, authenticated;
grant all on table public.bm_invoices to service_role;
revoke all on table public.bm_invoice_lines from public, anon, authenticated;
grant all on table public.bm_invoice_lines to service_role;
revoke all on table public.bm_receipts from public, anon, authenticated;
grant all on table public.bm_receipts to service_role;
revoke all on table public.bm_receipt_lines from public, anon, authenticated;
grant all on table public.bm_receipt_lines to service_role;

notify pgrst, 'reload schema';
