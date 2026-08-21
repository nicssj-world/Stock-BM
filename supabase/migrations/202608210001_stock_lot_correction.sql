-- Correct a BM stock lot at its source so every transaction that references the
-- stable lot id immediately reads the corrected lot number and expiry date.
-- The movement ledger remains append-only; this is a controlled master-data
-- correction with an audit record.

create or replace function public.update_bm_stock_lot(
  p_lot uuid,
  p_lot_number text,
  p_expiry_date date,
  p_reason text,
  p_actor uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_lot public.bm_stock_lots;
  v_item public.bm_stock_items;
  v_lot_number text := trim(coalesce(p_lot_number, ''));
  v_reason text := trim(coalesce(p_reason, ''));
  v_old_lot_number text;
  v_old_expiry_date date;
  v_control_lot_count integer := 0;
  v_consumable_count integer := 0;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role <> 'Admin' then raise exception 'Admin permission required for lot correction'; end if;
  if v_reason = '' then raise exception 'Lot correction reason is required'; end if;
  if length(v_reason) > 500 then raise exception 'Lot correction reason is too long'; end if;
  if v_lot_number = '' then raise exception 'Lot number is required'; end if;
  if length(v_lot_number) > 120 then raise exception 'Lot number is too long'; end if;

  select * into v_lot
  from public.bm_stock_lots
  where id = p_lot
  for update;
  if not found then raise exception 'BM stock lot not found'; end if;

  select * into v_item
  from public.bm_stock_items
  where id = v_lot.item_id
  for share;
  if not found then raise exception 'BM stock item not found'; end if;

  if not v_item.track_lot and v_lot_number <> 'NO-LOT' then
    raise exception 'This item does not track lot numbers';
  end if;
  if v_item.track_expiry and p_expiry_date is null then
    raise exception 'Expiry date is required for this item';
  end if;
  if not v_item.track_expiry and p_expiry_date is not null then
    raise exception 'This item does not track expiry dates';
  end if;
  if exists (
    select 1
    from public.bm_stock_lots
    where item_id = v_lot.item_id
      and lot_number = v_lot_number
      and id <> p_lot
  ) then
    raise exception 'Another lot with this lot number already exists for the item';
  end if;

  v_old_lot_number := v_lot.lot_number;
  v_old_expiry_date := v_lot.expiry_date;

  if v_old_lot_number = v_lot_number and v_old_expiry_date is not distinct from p_expiry_date then
    return jsonb_build_object(
      'lotId', p_lot,
      'lotNumber', v_lot_number,
      'expiryDate', p_expiry_date,
      'changed', false,
      'linkedControlLotCount', 0,
      'linkedConsumableCount', 0
    );
  end if;

  update public.bm_stock_lots
  set lot_number = v_lot_number,
      expiry_date = p_expiry_date
  where id = p_lot;

  -- These tables copy the stock lot label when they are linked to a BM lot.
  -- Keep those historical labels aligned while preserving their own record ids.
  update public.iqc_control_lots
  set lot_number = v_lot_number,
      expiry_date = p_expiry_date
  where stock_lot_id = p_lot
    and (lot_number is distinct from v_lot_number or expiry_date is distinct from p_expiry_date);
  get diagnostics v_control_lot_count = row_count;

  update public.iqc_run_consumables
  set lot_number = v_lot_number
  where stock_lot_id = p_lot
    and lot_number is distinct from v_lot_number;
  get diagnostics v_consumable_count = row_count;

  insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
  values (
    p_actor,
    'stock.lot.update',
    'stock-lot',
    p_lot,
    jsonb_build_object(
      'itemId', v_lot.item_id,
      'before', jsonb_build_object('lotNumber', v_old_lot_number, 'expiryDate', v_old_expiry_date),
      'after', jsonb_build_object('lotNumber', v_lot_number, 'expiryDate', p_expiry_date),
      'reason', v_reason,
      'linkedControlLotCount', v_control_lot_count,
      'linkedConsumableCount', v_consumable_count
    )
  );

  return jsonb_build_object(
    'lotId', p_lot,
    'lotNumber', v_lot_number,
    'expiryDate', p_expiry_date,
    'changed', true,
    'linkedControlLotCount', v_control_lot_count,
    'linkedConsumableCount', v_consumable_count
  );
end;
$$;

revoke all on function public.update_bm_stock_lot(uuid, text, date, text, uuid) from public, anon, authenticated;
grant execute on function public.update_bm_stock_lot(uuid, text, date, text, uuid) to service_role;

notify pgrst, 'reload schema';
