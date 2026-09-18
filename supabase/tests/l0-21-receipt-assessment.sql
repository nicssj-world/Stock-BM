-- L0-21: confirming a receipt creates a Pending Receipt Assessment; completing
-- it enforces the conditional cold-chain answer and the abnormal-note rule;
-- the assessment never touches the stock ledger; OCR tables are retired.
do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_vendor uuid;
  v_receipt uuid := '7a000000-0000-0000-0000-000000000001';
  v_original_enabled boolean;
  v_original_exception boolean;
  v_transactions bigint;
  v_status text;
  v_rejected boolean;
begin
  select is_enabled, expiry_exception_enabled into v_original_enabled, v_original_exception
  from public.bm_receiving_policies order by version desc limit 1;
  update public.bm_receiving_policies set is_enabled = true, expiry_exception_enabled = false
  where version = (select max(version) from public.bm_receiving_policies);

  insert into public.bm_vendors(code, name, created_by)
  values ('L0-VENDOR-ASSESS', 'L0 receipt assessment vendor', v_actor)
  on conflict (code) do update set name = excluded.name
  returning id into v_vendor;

  insert into public.bm_receipts(id, receipt_no, vendor_id, received_date, received_by, created_by)
  values (v_receipt, 'L0-21-ASSESS', v_vendor, '2026-09-18', v_actor, v_actor)
  on conflict (id) do nothing;

  insert into public.bm_receipt_lines(
    id, receipt_id, line_no, stock_item_id, lot_number, expiry_date, lot_mode, location_id,
    received_qty, tor_expiry_compliance, barcode_additional_product_id, barcode_manufacture_date, barcode_serial
  ) values (
    '7a000000-0000-0000-0000-000000000011', v_receipt, 1,
    '30000000-0000-0000-0000-000000000001', 'L0-21-LOT', '2036-05-31', 'new',
    '20000000-0000-0000-0000-000000000001', 3, 'compliant', '0933', '2025-12-29', 'SER-L0-21'
  ) on conflict (id) do nothing;

  if exists (select 1 from public.bm_receipt_assessments where receipt_id = v_receipt) then
    raise exception 'L0-21 a draft receipt must not have an assessment';
  end if;

  select count(*) into v_transactions from public.bm_stock_transactions;
  perform public.confirm_bm_receipt(v_receipt, v_actor);
  if (select count(*) from public.bm_stock_transactions) <> v_transactions + 1 then
    raise exception 'L0-21 confirm did not write exactly one ledger transaction';
  end if;

  select status into v_status from public.bm_receipt_assessments where receipt_id = v_receipt;
  if v_status is distinct from 'pending' then
    raise exception 'L0-21 confirmation did not create a pending assessment (got %)', v_status;
  end if;
  if (select vendor_id from public.bm_receipt_assessments where receipt_id = v_receipt) <> v_vendor then
    raise exception 'L0-21 assessment vendor linkage is wrong';
  end if;

  select count(*) into v_transactions from public.bm_stock_transactions;

  -- Abnormal answer without a note is rejected.
  v_rejected := false;
  begin
    update public.bm_receipt_assessments
    set status = 'completed', product_condition = 'abnormal', documentation = 'complete',
        item_correctness = 'correct', cold_chain_applicable = false, has_complaint = false,
        note = null, assessed_by = v_actor, assessed_at = now()
    where receipt_id = v_receipt;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'L0-21 abnormal answer without a note was accepted'; end if;

  -- Cold chain applicable without the temperature-condition answer is rejected.
  v_rejected := false;
  begin
    update public.bm_receipt_assessments
    set status = 'completed', product_condition = 'normal', documentation = 'complete',
        item_correctness = 'correct', cold_chain_applicable = true, cold_chain_condition = null,
        has_complaint = false, assessed_by = v_actor, assessed_at = now()
    where receipt_id = v_receipt;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'L0-21 cold chain without condition was accepted'; end if;

  -- A condition answer without cold chain is rejected.
  v_rejected := false;
  begin
    update public.bm_receipt_assessments
    set status = 'completed', product_condition = 'normal', documentation = 'complete',
        item_correctness = 'correct', cold_chain_applicable = false, cold_chain_condition = 'appropriate',
        has_complaint = false, assessed_by = v_actor, assessed_at = now()
    where receipt_id = v_receipt;
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception 'L0-21 condition without cold chain was accepted'; end if;

  -- All-normal answers complete without a note.
  update public.bm_receipt_assessments
  set status = 'completed', product_condition = 'normal', documentation = 'complete',
      item_correctness = 'correct', cold_chain_applicable = true, cold_chain_condition = 'appropriate',
      has_complaint = false, note = null, assessed_by = v_actor, assessed_at = now(), updated_at = now()
  where receipt_id = v_receipt and status = 'pending';
  if (select status from public.bm_receipt_assessments where receipt_id = v_receipt) <> 'completed' then
    raise exception 'L0-21 normal assessment did not complete';
  end if;

  if (select count(*) from public.bm_stock_transactions) <> v_transactions then
    raise exception 'L0-21 assessment changed the stock ledger';
  end if;
  if (select status from public.bm_receipts where id = v_receipt) <> 'confirmed' then
    raise exception 'L0-21 assessment changed the receipt status';
  end if;
  if (select barcode_additional_product_id from public.bm_receipt_lines where id = '7a000000-0000-0000-0000-000000000011') <> '0933' then
    raise exception 'L0-21 AI 240 evidence was not persisted';
  end if;

  if to_regclass('public.bm_ocr_jobs') is not null or to_regclass('public.bm_ocr_candidates') is not null then
    raise exception 'L0-21 retired OCR tables still exist';
  end if;

  update public.bm_receiving_policies set is_enabled = v_original_enabled, expiry_exception_enabled = v_original_exception
  where version = (select max(version) from public.bm_receiving_policies);

  raise notice 'L0-21 RECEIPT ASSESSMENT PASS: pending on confirm, conditional cold chain, abnormal note, vendor linkage, ledger isolation, OCR tables retired.';
end $$;
