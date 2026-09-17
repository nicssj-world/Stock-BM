-- 1E acceptance: one open invoice can be received in two confirmed receipts.
-- The invoice remains open and closure_state remains manual until P-09.

update public.bm_receiving_policies
set is_enabled = true,
    expiry_exception_enabled = false
where version = (select max(version) from public.bm_receiving_policies);

insert into public.bm_invoices (
  id, vendor_id, invoice_no, invoice_date, status, source, created_by
)
select
  '73000000-0000-0000-0000-000000000001', id, 'L0-1E-PARTIAL', '2026-09-17', 'open', 'manual',
  '00000000-0000-0000-0000-000000000001'
from public.bm_vendors
where code = 'HARNESS-VENDOR-001'
on conflict (id) do nothing;

insert into public.bm_invoice_lines (
  id, invoice_id, line_no, stock_item_id, description_text, expected_qty, closure_state
)
values (
  '74000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001',
  1,
  '30000000-0000-0000-0000-000000000001',
  'L0-1E partial quantity',
  10,
  'open'
)
on conflict (id) do nothing;

insert into public.bm_receipts (
  id, receipt_no, invoice_id, vendor_id, received_date, received_by, created_by
)
select
  '75000000-0000-0000-0000-000000000001', 'L0-1E-PARTIAL-1',
  '73000000-0000-0000-0000-000000000001', id, '2026-09-18',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
from public.bm_vendors
where code = 'HARNESS-VENDOR-001'
on conflict (id) do nothing;

insert into public.bm_receipt_lines (
  id, receipt_id, line_no, invoice_line_id, stock_item_id, lot_number, expiry_date,
  lot_mode, location_id, expected_qty, received_qty, tor_expiry_compliance
)
values (
  '76000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  1,
  '74000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'L0-1E-PARTIAL-LOT-1', '2035-01-31', 'new',
  '20000000-0000-0000-0000-000000000001', 10, 8, 'compliant'
)
on conflict (id) do nothing;

insert into public.bm_receipts (
  id, receipt_no, invoice_id, vendor_id, received_date, received_by, created_by
)
select
  '75000000-0000-0000-0000-000000000002', 'L0-1E-PARTIAL-2',
  '73000000-0000-0000-0000-000000000001', id, '2026-09-19',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
from public.bm_vendors
where code = 'HARNESS-VENDOR-001'
on conflict (id) do nothing;

insert into public.bm_receipt_lines (
  id, receipt_id, line_no, invoice_line_id, stock_item_id, lot_number, expiry_date,
  lot_mode, location_id, expected_qty, received_qty, tor_expiry_compliance
)
values (
  '76000000-0000-0000-0000-000000000002',
  '75000000-0000-0000-0000-000000000002',
  1,
  '74000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'L0-1E-PARTIAL-LOT-2', '2035-01-31', 'new',
  '20000000-0000-0000-0000-000000000001', 10, 2, 'compliant'
)
on conflict (id) do nothing;

select public.confirm_bm_receipt(
  '75000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
);
select public.confirm_bm_receipt(
  '75000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001'
);

do $$
declare
  v_invoice_status text;
  v_closure_state text;
  v_total numeric;
  v_linked bigint;
begin
  select status into v_invoice_status
  from public.bm_invoices
  where id = '73000000-0000-0000-0000-000000000001';
  select closure_state into v_closure_state
  from public.bm_invoice_lines
  where id = '74000000-0000-0000-0000-000000000001';
  select coalesce(sum(received_qty), 0), count(*)
  into v_total, v_linked
  from public.bm_receipt_lines
  where invoice_line_id = '74000000-0000-0000-0000-000000000001';

  if v_invoice_status <> 'open' then
    raise exception '1E: invoice status changed unexpectedly: %', v_invoice_status;
  end if;
  if v_closure_state <> 'open' then
    raise exception '1E: closure state changed without P-09 policy: %', v_closure_state;
  end if;
  if v_total <> 10 or v_linked <> 2 then
    raise exception '1E: expected cumulative 10 across 2 linked receipts, got % across %', v_total, v_linked;
  end if;
  if (select count(*) from public.bm_receipts where invoice_id = '73000000-0000-0000-0000-000000000001' and status = 'confirmed') <> 2 then
    raise exception '1E: both partial receipts were not confirmed';
  end if;
end;
$$;

update public.bm_receiving_policies
set is_enabled = false,
    expiry_exception_enabled = false
where version = (select max(version) from public.bm_receiving_policies);

select '1E partial receiving PASS' as verification;
