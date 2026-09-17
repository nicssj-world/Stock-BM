-- L0-8: the existing single-line Receive RPC remains unchanged and usable.

do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_item uuid := '30000000-0000-0000-0000-000000000001';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_tx uuid;
  v_lot uuid;
  v_before_lot_count bigint;
  v_after_lot_count bigint;
  v_before_tx_count bigint;
  v_after_tx_count bigint;
  v_before_balance numeric;
  v_after_balance numeric;
  v_quantity numeric;
  v_expiry date;
begin
  v_before_lot_count := (select count(*) from public.bm_stock_lots);
  v_before_tx_count := (select count(*) from public.bm_stock_transactions);
  v_before_balance := public.bm_lot_location_balance(
    '40000000-0000-0000-0000-000000000001', v_location
  );

  v_tx := public.receive_bm_stock(
    v_item,
    'L0-8-LEGACY-NEW',
    '2030-01-31',
    7,
    v_location,
    'Legacy supplier text',
    'L0-8 legacy reference',
    'L0-8 legacy note',
    null,
    v_actor
  );

  select id, expiry_date
    into v_lot, v_expiry
  from public.bm_stock_lots
  where item_id = v_item and lot_number = 'L0-8-LEGACY-NEW';

  v_after_lot_count := (select count(*) from public.bm_stock_lots);
  v_after_tx_count := (select count(*) from public.bm_stock_transactions);
  v_after_balance := public.bm_lot_location_balance(v_lot, v_location);

  if v_after_lot_count <> v_before_lot_count + 1 then
    raise exception 'L0-8: expected one legacy lot creation';
  end if;
  if v_after_tx_count <> v_before_tx_count + 1 then
    raise exception 'L0-8: expected one legacy transaction';
  end if;
  if v_expiry <> '2030-01-31' then
    raise exception 'L0-8: legacy lot expiry changed unexpectedly';
  end if;
  if v_after_balance <> 7 then
    raise exception 'L0-8: expected new-lot balance 7, got %', v_after_balance;
  end if;

  select quantity
    into v_quantity
  from public.bm_stock_movement_lines
  where transaction_id = v_tx;
  if v_quantity <> 7 then
    raise exception 'L0-8: expected movement quantity 7, got %', v_quantity;
  end if;

  if not exists (
    select 1 from public.bm_stock_transactions
    where id = v_tx and transaction_type = 'receive'
      and reference_text = 'L0-8 legacy reference'
      and note = 'L0-8 legacy note'
  ) then
    raise exception 'L0-8: legacy transaction shape changed';
  end if;
end;
$$;

select 'L0-8 PASS' as verification;
