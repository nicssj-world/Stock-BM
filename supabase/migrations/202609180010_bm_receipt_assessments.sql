-- Stock1 final scope (owner decision after real-iPhone acceptance testing):
--   * post-receipt Receipt Assessment that feeds Vendor Performance and the
--     Annual Vendor Evaluation;
--   * additive barcode metadata on receipt lines (AI 240 / 11 / 15 / 21);
--   * forward-only retirement of the invoice-OCR audit tables.
-- Nothing here touches the stock ledger, balances, lots or the receive RPCs.

-- 1. Receipt Assessment ---------------------------------------------------
-- One assessment per confirmed receipt. Quantity/completeness is NOT asked
-- here: it is derived from bm_receipt_lines / bm_invoice_lines instead.
create table if not exists public.bm_receipt_assessments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique references public.bm_receipts(id),
  vendor_id uuid not null references public.bm_vendors(id),
  status text not null default 'pending' check (status in ('pending','completed')),
  product_condition text check (product_condition is null or product_condition in ('normal','abnormal')),
  documentation text check (documentation is null or documentation in ('complete','incomplete')),
  item_correctness text check (item_correctness is null or item_correctness in ('correct','problem')),
  cold_chain_applicable boolean,
  cold_chain_condition text check (cold_chain_condition is null or cold_chain_condition in ('appropriate','inappropriate')),
  has_complaint boolean,
  note text,
  assessed_by uuid references public.nipt_users(id),
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bm_receipt_assessments_completed_answers check (
    status = 'pending'
    or (product_condition is not null
        and documentation is not null
        and item_correctness is not null
        and cold_chain_applicable is not null
        and has_complaint is not null
        and assessed_by is not null
        and assessed_at is not null)
  ),
  -- The temperature-condition answer exists only when cold chain applies.
  constraint bm_receipt_assessments_cold_chain_scope check (
    (cold_chain_applicable is true and (status = 'pending' or cold_chain_condition is not null))
    or (cold_chain_applicable is not true and cold_chain_condition is null)
  ),
  -- Any abnormal answer makes the note mandatory.
  constraint bm_receipt_assessments_abnormal_note check (
    status = 'pending'
    or not (
      product_condition = 'abnormal'
      or documentation = 'incomplete'
      or item_correctness = 'problem'
      or cold_chain_condition = 'inappropriate'
      or has_complaint is true
    )
    or nullif(trim(coalesce(note, '')), '') is not null
  )
);

create index if not exists bm_receipt_assessments_vendor_status
  on public.bm_receipt_assessments(vendor_id, status);

-- A confirmed receipt always has an assessment row, so a dismissed popup
-- leaves a Pending assessment instead of nothing. The stock transaction is
-- already committed by confirm_bm_receipt; this only records follow-up work.
create or replace function public.bm_receipt_assessment_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    insert into public.bm_receipt_assessments(receipt_id, vendor_id, status)
    values (new.id, new.vendor_id, 'pending')
    on conflict (receipt_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists bm_receipts_assessment_on_confirm on public.bm_receipts;
create trigger bm_receipts_assessment_on_confirm
after insert or update of status on public.bm_receipts
for each row execute function public.bm_receipt_assessment_on_confirm();

insert into public.bm_receipt_assessments(receipt_id, vendor_id, status)
select receipts.id, receipts.vendor_id, 'pending'
from public.bm_receipts as receipts
where receipts.status = 'confirmed'
on conflict (receipt_id) do nothing;

alter table public.bm_receipt_assessments enable row level security;
create policy bm_receipt_assessments_active_read on public.bm_receipt_assessments
for select using (public.current_bm_role() is not null);

revoke all on table public.bm_receipt_assessments from public, anon, authenticated;
grant all on table public.bm_receipt_assessments to service_role;
revoke all on function public.bm_receipt_assessment_on_confirm() from public, anon, authenticated;

-- 2. Barcode metadata kept as receipt evidence ------------------------------
-- AI 240 is stored as-is. It is never copied into Catalog/REF.
alter table public.bm_receipt_lines
  add column if not exists barcode_additional_product_id text,
  add column if not exists barcode_manufacture_date date,
  add column if not exists barcode_best_before date,
  add column if not exists barcode_serial text;

-- 3. Retire invoice OCR ------------------------------------------------------
-- Owner removed OCR from the approved Stock1 scope after real-iPhone
-- acceptance testing. 202609180007 is left in history unchanged; its two
-- audit tables were never populated outside local harnesses and nothing
-- references them, so they are dropped forward-only here. The historical
-- bm_invoices.source/ocr_job_id and bm_receipts.source columns stay as
-- harmless additive columns (no code writes 'ocr' any more).
drop table if exists public.bm_ocr_candidates;
drop table if exists public.bm_ocr_jobs;

notify pgrst, 'reload schema';
