-- New receiving helpers and the single transaction boundary for the new flow.
-- The existing receive_bm_stock_bundle function is deliberately not redefined.

create or replace function public.bm_add_calendar_months(p_date date, p_months integer)
returns date
language sql
immutable
security definer
set search_path = public
as $$
  select (p_date + make_interval(months => p_months))::date;
$$;

create or replace function public.bm_tor_expiry_compliance(p_expiry date, p_received date, p_months integer)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_expiry is null then 'not_applicable'
    when p_expiry > public.bm_add_calendar_months(p_received, p_months) then 'compliant'
    else 'not_compliant'
  end;
$$;

create or replace function public.confirm_bm_receipt(p_receipt uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.bm_receiving_policies;
  v_receipt public.bm_receipts;
  v_line public.bm_receipt_lines;
  v_item public.bm_stock_items;
  v_lot public.bm_stock_lots;
  v_transaction uuid;
  v_line_count integer;
  v_lot_number text;
  v_expiry date;
  v_compliance text;
  v_lines jsonb := '[]'::jsonb;
  v_resolved jsonb := '[]'::jsonb;
  v_resolved_line record;
  v_saved_line record;
begin
  perform public.assert_bm_stock_actor(p_actor);

  select * into v_policy
  from public.bm_receiving_policies
  order by version desc
  limit 1;
  if not found then raise exception 'Receiving policy is not configured'; end if;
  if not v_policy.is_enabled then raise exception 'Receiving workflow is not enabled'; end if;

  select * into v_receipt
  from public.bm_receipts
  where id = p_receipt
  for update;
  if not found then raise exception 'BM receipt not found'; end if;
  if v_receipt.status <> 'draft' then raise exception 'Only draft receipts can be confirmed'; end if;

  select count(*) into v_line_count
  from public.bm_receipt_lines
  where receipt_id = p_receipt;
  if v_line_count = 0 then raise exception 'At least one receipt line is required'; end if;

  -- Lock already-resolved lots in UUID order before validating any line.
  perform 1
  from public.bm_stock_lots
  where id in (select stock_lot_id from public.bm_receipt_lines where receipt_id = p_receipt and stock_lot_id is not null)
  order by id
  for update;

  for v_line in
    select * from public.bm_receipt_lines
    where receipt_id = p_receipt
    order by line_no, id
  loop
    select * into v_item
    from public.bm_stock_items
    where id = v_line.stock_item_id
    for share;
    if not found or not v_item.is_active then raise exception 'Active BM stock item not found'; end if;

    v_lot_number := trim(coalesce(v_line.lot_number, ''));
    v_expiry := v_line.expiry_date;
    if v_item.track_lot then
      if v_lot_number = '' then raise exception 'Lot number is required for this item'; end if;
    else
      v_lot_number := 'NO-LOT';
      v_expiry := null;
    end if;
    if v_item.track_expiry and v_expiry is null then raise exception 'Expiry date is required for this item'; end if;
    if not v_item.track_expiry then v_expiry := null; end if;

    if v_line.stock_lot_id is not null then
      select * into v_lot
      from public.bm_stock_lots
      where id = v_line.stock_lot_id
      for update;
      if not found then raise exception 'BM stock lot not found'; end if;
      if v_lot.item_id <> v_item.id then raise exception 'Resolved lot belongs to a different item'; end if;
      if v_lot.lot_number <> v_lot_number then raise exception 'Receipt lot number does not match the existing lot'; end if;
    else
      insert into public.bm_stock_lots(item_id, lot_number, expiry_date, created_by)
      values (v_item.id, v_lot_number, v_expiry, p_actor)
      on conflict (item_id, lot_number) do nothing;

      select * into v_lot
      from public.bm_stock_lots
      where item_id = v_item.id and lot_number = v_lot_number
    for update;
      if not found then raise exception 'Failed to resolve stock lot'; end if;
      if v_lot.item_id <> v_item.id then raise exception 'Resolved lot belongs to a different item'; end if;
    end if;

    if v_lot.expiry_date is distinct from v_expiry then
      raise exception 'Existing lot expiry date does not match';
    end if;

    if v_line.tor_threshold_months <> 6 then
      raise exception 'The global TOR threshold is six calendar months';
    end if;
    v_compliance := public.bm_tor_expiry_compliance(v_expiry, v_receipt.received_date, v_line.tor_threshold_months);
    if v_compliance is distinct from v_line.tor_expiry_compliance then
      raise exception 'TOR expiry compliance does not match server calculation';
    end if;
    if v_compliance = 'not_compliant' then
      if not v_policy.expiry_exception_enabled then
        raise exception 'Expiry exception acceptance is not enabled (pending policy approval)';
      end if;
      if v_line.receipt_decision <> 'accepted_with_justification' then
        raise exception 'Expiry exception justification is required';
      end if;
      if v_line.acceptance_reason_code is null
        or (v_line.acceptance_reason_code = 'other' and nullif(trim(coalesce(v_line.acceptance_reason_note, '')), '') is null)
      then
        raise exception 'Expiry exception reason is incomplete';
      end if;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'lot_id', v_lot.id,
      'location_id', v_line.location_id,
      'quantity', v_line.received_qty
    ));
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'line_id', v_line.id,
      'lot_id', v_lot.id
    ));
  end loop;

  -- This is the only new-workflow ledger call. The existing function owns the
  -- transaction and movement-line writes and is intentionally untouched.
  v_transaction := public.receive_bm_stock_bundle(
    v_lines,
    nullif(trim(coalesce(v_receipt.receipt_no, '')), ''),
    v_receipt.note,
    p_actor
  );

  for v_resolved_line in
    select * from jsonb_to_recordset(v_resolved) as x(line_id uuid, lot_id uuid)
  loop
    update public.bm_receipt_lines
    set stock_lot_id = v_resolved_line.lot_id,
        accepted_by = case when tor_expiry_compliance = 'not_compliant' then coalesce(accepted_by, p_actor) else accepted_by end,
        accepted_at = case when tor_expiry_compliance = 'not_compliant' then coalesce(accepted_at, now()) else accepted_at end,
        updated_at = now()
    where id = v_resolved_line.line_id;
  end loop;

  update public.bm_receipts
  set status = 'confirmed',
      stock_transaction_id = v_transaction,
      confirmed_by = p_actor,
      confirmed_at = now(),
      updated_at = now()
  where id = p_receipt;

  -- Scanned identifiers are additive evidence. They never rewrite the stock
  -- item or lot identity columns.
  for v_saved_line in
    select * from public.bm_receipt_lines
    where receipt_id = p_receipt
    order by line_no, id
  loop
    if nullif(trim(coalesce(v_saved_line.barcode_gtin, '')), '') is not null then
      insert into public.bm_stock_item_barcodes(stock_item_id, barcode, symbology, standard, created_by)
      values (
        v_saved_line.stock_item_id,
        trim(v_saved_line.barcode_gtin),
        v_saved_line.barcode_symbology,
        v_saved_line.barcode_standard,
        p_actor
      )
      on conflict do nothing;
    end if;
    if nullif(trim(coalesce(v_saved_line.barcode_lot, '')), '') is not null
      or (nullif(trim(coalesce(v_saved_line.barcode_raw, '')), '') is not null and nullif(trim(coalesce(v_saved_line.barcode_gtin, '')), '') is null)
    then
      insert into public.bm_stock_lot_barcodes(stock_lot_id, barcode, symbology, standard, raw_payload, created_by)
      values (
        v_saved_line.stock_lot_id,
        coalesce(nullif(trim(v_saved_line.barcode_lot), ''), trim(v_saved_line.barcode_raw)),
        v_saved_line.barcode_symbology,
        v_saved_line.barcode_standard,
        v_saved_line.barcode_raw,
        p_actor
      )
      on conflict do nothing;
    end if;
  end loop;

  for v_saved_line in
    select * from public.bm_receipt_lines
    where receipt_id = p_receipt
      and tor_expiry_compliance = 'not_compliant'
    order by line_no, id
  loop
    insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
    values (
      p_actor,
      'receiving.expiry.exception',
      'stock-receipt-line',
      v_saved_line.id,
      jsonb_build_object(
        'receipt_id', p_receipt,
        'receipt_line_id', v_saved_line.id,
        'invoice_id', v_receipt.invoice_id,
        'vendor_id', v_receipt.vendor_id,
        'stock_item_id', v_saved_line.stock_item_id,
        'stock_lot_id', v_saved_line.stock_lot_id,
        'expiry_date', v_saved_line.expiry_date,
        'received_date', v_receipt.received_date,
        'tor_threshold_months', v_saved_line.tor_threshold_months,
        'remaining_shelf_life_days', v_saved_line.remaining_shelf_life_days,
        'reason_code', v_saved_line.acceptance_reason_code,
        'reason_note', v_saved_line.acceptance_reason_note,
        'accepted_by', coalesce(v_saved_line.accepted_by, p_actor),
        'accepted_at', coalesce(v_saved_line.accepted_at, now()),
        'evidence_optional', true
      )
    );
  end loop;

  return v_transaction;
end;
$$;

revoke all on function public.bm_add_calendar_months(date, integer) from public, anon, authenticated;
grant execute on function public.bm_add_calendar_months(date, integer) to service_role;
revoke all on function public.bm_tor_expiry_compliance(date, date, integer) from public, anon, authenticated;
grant execute on function public.bm_tor_expiry_compliance(date, date, integer) to service_role;
revoke all on function public.confirm_bm_receipt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_bm_receipt(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
