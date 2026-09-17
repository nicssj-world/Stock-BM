-- L0-2 through L0-10: receiving confirmation, atomicity, invariants, and gates.
-- These checks run against the real local PostgreSQL database, not a mock.

insert into public.bm_vendors (id, code, name, created_by)
values (
  '90000000-0000-0000-0000-000000000001', 'HARNESS-VENDOR-001', 'Harness receiving vendor',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

update public.bm_receiving_policies
set is_enabled = true,
    expiry_exception_enabled = false
where version = (select max(version) from public.bm_receiving_policies);

-- L0-2: an outer transaction abort after the ledger call rolls back the whole
-- confirm unit, leaving the receipt draft and creating no lot or ledger rows.
insert into public.bm_receipts (
  id, receipt_no, vendor_id, received_date, received_by, created_by
)
select
  '71000000-0000-0000-0000-000000000002', 'L0-2-ROLLBACK', id, '2026-09-18',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'
from public.bm_vendors
where code = 'HARNESS-VENDOR-001'
on conflict (id) do nothing;

insert into public.bm_receipt_lines (
  id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
  location_id, received_qty, tor_expiry_compliance
)
values (
  '72000000-0000-0000-0000-000000000002',
  '71000000-0000-0000-0000-000000000002',
  1, '30000000-0000-0000-0000-000000000001', 'L0-2-ROLLBACK-LOT', '2030-01-31', 'new',
  '20000000-0000-0000-0000-000000000001', 4, 'compliant'
)
on conflict (id) do nothing;

begin;
select public.confirm_bm_receipt(
  '71000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001'
);
rollback;

do $$
declare
  v_status text;
begin
  select status into v_status
  from public.bm_receipts
  where id = '71000000-0000-0000-0000-000000000002';
  if v_status <> 'draft' then
    raise exception 'L0-2: receipt left draft after rollback: %', v_status;
  end if;
  if exists (select 1 from public.bm_stock_lots where lot_number = 'L0-2-ROLLBACK-LOT') then
    raise exception 'L0-2: rollback left a new lot';
  end if;
  if exists (
    select 1
    from public.bm_stock_transactions
    where reference_text = 'L0-2-ROLLBACK'
  ) then
    raise exception 'L0-2: rollback left a stock transaction';
  end if;
  if exists (
    select 1
    from public.bm_stock_movement_lines as movement
    join public.bm_stock_transactions as transaction_row on transaction_row.id = movement.transaction_id
    where transaction_row.reference_text = 'L0-2-ROLLBACK'
  ) then
    raise exception 'L0-2: rollback left movement lines';
  end if;
end;
$$;

-- L0-3: an existing lot is reused, its expiry is unchanged, and only balance
-- changes by the received quantity.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_item uuid := '30000000-0000-0000-0000-000000000001';
  v_lot uuid := '40000000-0000-0000-0000-000000000001';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_before_lot_count bigint;
  v_before_balance numeric;
  v_before_expiry date;
  v_after_balance numeric;
  v_after_expiry date;
  v_tx uuid;
begin
  select count(*) into v_before_lot_count
  from public.bm_stock_lots where item_id = v_item;
  select expiry_date into v_before_expiry
  from public.bm_stock_lots where id = v_lot;
  v_before_balance := public.bm_lot_location_balance(v_lot, v_location);

  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by, created_by
  )
  select
    '71000000-0000-0000-0000-000000000003', 'L0-3-EXISTING', id, '2026-09-18', v_actor, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, stock_lot_id, lot_number, expiry_date,
    lot_mode, location_id, received_qty, tor_expiry_compliance
  ) values (
    '72000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000003',
    1, v_item, v_lot, 'HARNESS-LOT-001', '2028-12-31', 'existing', v_location, 2, 'compliant'
  ) on conflict (id) do nothing;

  v_tx := public.confirm_bm_receipt('71000000-0000-0000-0000-000000000003', v_actor);
  v_after_balance := public.bm_lot_location_balance(v_lot, v_location);
  select expiry_date into v_after_expiry from public.bm_stock_lots where id = v_lot;

  if (select count(*) from public.bm_stock_lots where item_id = v_item) <> v_before_lot_count then
    raise exception 'L0-3: existing-lot receive created a lot';
  end if;
  if v_after_balance <> v_before_balance + 2 then
    raise exception 'L0-3: expected balance delta 2, got % from %', v_after_balance, v_before_balance;
  end if;
  if v_after_expiry is distinct from v_before_expiry then
    raise exception 'L0-3: existing lot expiry changed from % to %', v_before_expiry, v_after_expiry;
  end if;
  if not exists (select 1 from public.bm_stock_movement_lines where transaction_id = v_tx and lot_id = v_lot and quantity = 2) then
    raise exception 'L0-3: expected movement line was not written';
  end if;
end;
$$;

-- L0-4: new lot creates one row, stores the scanned lot barcode additively,
-- and does not populate the legacy manufacturer_barcode column.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_item uuid := '30000000-0000-0000-0000-000000000001';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_lot uuid;
begin
  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by, created_by
  )
  select
    '71000000-0000-0000-0000-000000000004', 'L0-4-NEW', id, '2026-09-18', v_actor, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
    location_id, received_qty, barcode_raw, barcode_symbology, barcode_standard,
    barcode_gtin, barcode_lot, barcode_expiry, tor_expiry_compliance
  ) values (
    '72000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-000000000004',
    1, v_item, 'L0-4-NEW-LOT', '2031-01-31', 'new', v_location, 1,
    'L0-4-GTIN|L0-4-LOT', 'gs1-128', 'L0-4', 'L0-4-GTIN', 'L0-4-LOT', '2031-01-31', 'compliant'
  ) on conflict (id) do nothing;

  perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000004', v_actor);
  select id into v_lot from public.bm_stock_lots where item_id = v_item and lot_number = 'L0-4-NEW-LOT';
  if v_lot is null then raise exception 'L0-4: new lot was not created'; end if;
  if (select count(*) from public.bm_stock_lots where item_id = v_item and lot_number = 'L0-4-NEW-LOT') <> 1 then
    raise exception 'L0-4: new lot count is not exactly one';
  end if;
  if (select manufacturer_barcode from public.bm_stock_lots where id = v_lot) is not null then
    raise exception 'L0-4: legacy lot manufacturer_barcode was populated';
  end if;
  if not exists (select 1 from public.bm_stock_lot_barcodes where stock_lot_id = v_lot and barcode = 'L0-4-LOT') then
    raise exception 'L0-4: normalized lot barcode was not populated';
  end if;
end;
$$;

-- L0-5: one multi-line receipt writes one transaction and the balance view
-- reports the hand-computed quantity for both lot/location pairs.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_item_one uuid := '30000000-0000-0000-0000-000000000001';
  v_item_two uuid := '30000000-0000-0000-0000-000000000002';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_lot_one uuid;
  v_lot_two uuid;
  v_tx uuid;
begin
  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by,
    packaging_status, temperature_status, temperature_value_c, cold_chain_applicable,
    created_by
  )
  select
    '71000000-0000-0000-0000-000000000005', 'L0-5-MULTI', id, '2026-09-18', v_actor,
    'acceptable', 'acceptable', 4.5, true, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
    location_id, received_qty, tor_expiry_compliance
  ) values
    ('72000000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-000000000005', 1, v_item_one, 'L0-5-A', '2031-02-28', 'new', v_location, 2.5, 'compliant'),
    ('72000000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-000000000005', 2, v_item_two, 'L0-5-B', '2031-02-28', 'new', v_location, 3.5, 'compliant')
  on conflict (id) do nothing;

  v_tx := public.confirm_bm_receipt('71000000-0000-0000-0000-000000000005', v_actor);
  select id into v_lot_one from public.bm_stock_lots where item_id = v_item_one and lot_number = 'L0-5-A';
  select id into v_lot_two from public.bm_stock_lots where item_id = v_item_two and lot_number = 'L0-5-B';
  if (select count(*) from public.bm_stock_movement_lines where transaction_id = v_tx) <> 2 then
    raise exception 'L0-5: expected exactly two movement lines';
  end if;
  if not exists (
    select 1 from public.bm_receipts
    where id = '71000000-0000-0000-0000-000000000005'
      and stock_transaction_id = v_tx
      and packaging_status = 'acceptable'
      and temperature_status = 'acceptable'
      and temperature_value_c = 4.5
      and cold_chain_applicable
  ) then
    raise exception 'L0-5: receipt evidence or stock transaction link was not retained';
  end if;
  if (select on_hand from public.bm_stock_lot_location_balances where lot_id = v_lot_one and location_id = v_location) <> 2.5 then
    raise exception 'L0-5: first balance is not 2.5';
  end if;
  if (select on_hand from public.bm_stock_lot_location_balances where lot_id = v_lot_two and location_id = v_location) <> 3.5 then
    raise exception 'L0-5: second balance is not 3.5';
  end if;
end;
$$;

-- L0-6: an existing lot with a conflicting expiry fails and leaves no ledger
-- write, no lot mutation, and no receipt confirmation.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_error text;
  v_status text;
  v_before_tx bigint;
  v_after_tx bigint;
  v_expiry date;
begin
  select count(*) into v_before_tx from public.bm_stock_transactions;
  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by, created_by
  )
  select
    '71000000-0000-0000-0000-000000000006', 'L0-6-MISMATCH', id, '2026-09-18', v_actor, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
    location_id, received_qty, tor_expiry_compliance
  ) values (
    '72000000-0000-0000-0000-000000000007', '71000000-0000-0000-0000-000000000006',
    1, '30000000-0000-0000-0000-000000000001', 'HARNESS-LOT-001', '2033-01-01', 'existing',
    '20000000-0000-0000-0000-000000000001', 1, 'compliant'
  ) on conflict (id) do nothing;

  begin
    perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000006', v_actor);
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or position('Existing lot expiry date does not match' in v_error) = 0 then
    raise exception 'L0-6: unexpected expiry mismatch result: %', v_error;
  end if;
  select count(*) into v_after_tx from public.bm_stock_transactions;
  select status into v_status from public.bm_receipts where id = '71000000-0000-0000-0000-000000000006';
  select expiry_date into v_expiry from public.bm_stock_lots where lot_number = 'HARNESS-LOT-001';
  if v_after_tx <> v_before_tx or v_status <> 'draft' or v_expiry <> '2028-12-31' then
    raise exception 'L0-6: mismatch did not fully roll back (tx %, status %, expiry %)', v_after_tx - v_before_tx, v_status, v_expiry;
  end if;
end;
$$;

-- L0-9: the receiving feature flag blocks confirmation without writes, then
-- the same valid draft succeeds once the local harness enables it.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_error text;
  v_status text;
begin
  update public.bm_receiving_policies set is_enabled = false where version = (select max(version) from public.bm_receiving_policies);
  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by, created_by
  )
  select
    '71000000-0000-0000-0000-000000000009', 'L0-9-FLAG', id, '2026-09-18', v_actor, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
    location_id, received_qty, tor_expiry_compliance
  ) values (
    '72000000-0000-0000-0000-000000000009', '71000000-0000-0000-0000-000000000009', 1,
    '30000000-0000-0000-0000-000000000001', 'L0-9-FLAG-LOT', '2031-01-31', 'new',
    '20000000-0000-0000-0000-000000000001', 1, 'compliant'
  ) on conflict (id) do nothing;
  begin
    perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000009', v_actor);
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or position('Receiving workflow is not enabled' in v_error) = 0 then
    raise exception 'L0-9: disabled flag did not raise the expected error: %', v_error;
  end if;
  select status into v_status from public.bm_receipts where id = '71000000-0000-0000-0000-000000000009';
  if v_status <> 'draft' or exists (select 1 from public.bm_stock_lots where lot_number = 'L0-9-FLAG-LOT') then
    raise exception 'L0-9: disabled flag created or confirmed data';
  end if;

  update public.bm_receiving_policies set is_enabled = true where version = (select max(version) from public.bm_receiving_policies);
  perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000009', v_actor);
  select status into v_status from public.bm_receipts where id = '71000000-0000-0000-0000-000000000009';
  if v_status <> 'confirmed' then raise exception 'L0-9: enabled flag did not permit confirmation'; end if;
end;
$$;

-- L0-10: non-compliant expiry is blocked while the exception gate is closed,
-- then succeeds with a complete reason while retaining NOT_COMPLIANT.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_error text;
  v_status text;
  v_compliance text;
  v_detail jsonb;
begin
  update public.bm_receiving_policies
  set is_enabled = true, expiry_exception_enabled = false
  where version = (select max(version) from public.bm_receiving_policies);
  insert into public.bm_receipts (
    id, receipt_no, vendor_id, received_date, received_by, created_by
  )
  select
    '71000000-0000-0000-0000-000000000010', 'L0-10-EXCEPTION', id, '2027-10-15', v_actor, v_actor
  from public.bm_vendors where code = 'HARNESS-VENDOR-001'
  on conflict (id) do nothing;
  insert into public.bm_receipt_lines (
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode,
    location_id, received_qty, tor_threshold_months, tor_expiry_compliance,
    receipt_decision, acceptance_reason_code
  ) values (
    '72000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000010', 1,
    '30000000-0000-0000-0000-000000000001', 'L0-10-EXCEPTION-LOT', '2028-04-15', 'new',
    '20000000-0000-0000-0000-000000000001', 1, 6, 'not_compliant',
    'accepted_with_justification', 'urgent_need'
  ) on conflict (id) do nothing;
  begin
    perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000010', v_actor);
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or position('Expiry exception acceptance is not enabled' in v_error) = 0 then
    raise exception 'L0-10: closed exception gate did not raise the expected error: %', v_error;
  end if;
  if exists (select 1 from public.bm_stock_lots where lot_number = 'L0-10-EXCEPTION-LOT') then
    raise exception 'L0-10: closed exception gate created a lot';
  end if;

  update public.bm_receiving_policies set expiry_exception_enabled = true where version = (select max(version) from public.bm_receiving_policies);
  perform public.confirm_bm_receipt('71000000-0000-0000-0000-000000000010', v_actor);
  select status into v_status from public.bm_receipts where id = '71000000-0000-0000-0000-000000000010';
  select tor_expiry_compliance into v_compliance from public.bm_receipt_lines where id = '72000000-0000-0000-0000-000000000010';
  select detail into v_detail from public.bm_audit_logs where action = 'receiving.expiry.exception' and entity_id = '72000000-0000-0000-0000-000000000010';
  if v_status <> 'confirmed' or v_compliance <> 'not_compliant' then
    raise exception 'L0-10: accepted exception changed status/compliance: %/%', v_status, v_compliance;
  end if;
  if v_detail->>'reason_code' <> 'urgent_need' or v_detail->>'receipt_id' <> '71000000-0000-0000-0000-000000000010' then
    raise exception 'L0-10: exception audit detail is incomplete: %', v_detail;
  end if;
end;
$$;

-- Restore the production-safe local default. The concurrency harness enables
-- the flag explicitly for its isolated behavioural checks.
update public.bm_receiving_policies
set is_enabled = false,
    expiry_exception_enabled = false
where version = (select max(version) from public.bm_receiving_policies);

select 'L0-2 PASS' as verification;
select 'L0-3 PASS' as verification;
select 'L0-4 PASS' as verification;
select 'L0-5 PASS' as verification;
select 'L0-6 PASS' as verification;
select 'L0-9 PASS' as verification;
select 'L0-10 PASS' as verification;
