-- L0-7: the existing HPV return consumer still uses the shared receive bundle.

do $$
declare
  v_actor uuid := '00000000-0000-0000-0000-000000000001';
  v_item uuid := '30000000-0000-0000-0000-000000000001';
  v_lot uuid := '40000000-0000-0000-0000-000000000001';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_site uuid := '60000000-0000-0000-0000-000000000001';
  v_distribution uuid := '60000000-0000-0000-0000-000000000002';
  v_receive_tx uuid;
  v_issue_tx uuid;
  v_return_id uuid;
  v_return_tx uuid;
  v_before_balance numeric;
  v_after_balance numeric;
  v_movement_quantity numeric;
begin
  v_before_balance := public.bm_lot_location_balance(v_lot, v_location);

  v_receive_tx := public.receive_bm_stock(
    v_item, 'HARNESS-LOT-001', '2028-12-31', 10, v_location,
    'Harness supplier', 'L0-7 setup receive', null, null, v_actor
  );
  v_issue_tx := public.issue_bm_stock(
    v_lot, v_location, 2, 'L0-7 setup issue', 'L0-7 setup issue', null, null, false, v_actor
  );

  insert into public.bm_hpv_sites (id, code, name, created_by)
  values (v_site, 'HARNESS-L0-7', 'Harness L0-7 Site', v_actor);

  insert into public.bm_hpv_kit_distributions (
    id, site_id, distributed_on, quantity, stock_lot_id, stock_location_id,
    stock_transaction_id, created_by
  )
  values (
    v_distribution, v_site, '2026-09-18', 2, v_lot, v_location,
    v_issue_tx, v_actor
  );

  v_return_id := public.return_hpv_kit_bundle(
    v_site,
    '2026-09-18',
    jsonb_build_array(jsonb_build_object(
      'distribution_id', v_distribution,
      'distribution_line_id', null,
      'lot_id', v_lot,
      'location_id', v_location,
      'quantity', 1
    )),
    'L0-7 return',
    'L0-7 HPV return regression',
    v_actor
  );

  select stock_transaction_id
    into v_return_tx
  from public.bm_hpv_kit_returns
  where id = v_return_id;

  if v_return_tx is null then
    raise exception 'L0-7: HPV return did not link a stock transaction';
  end if;

  select quantity
    into v_movement_quantity
  from public.bm_stock_movement_lines
  where transaction_id = v_return_tx;

  if v_movement_quantity <> 1 then
    raise exception 'L0-7: expected one returned unit, got %', v_movement_quantity;
  end if;

  v_after_balance := public.bm_lot_location_balance(v_lot, v_location);
  if v_after_balance <> v_before_balance + 9 then
    raise exception 'L0-7: unexpected balance %, expected %', v_after_balance, v_before_balance + 9;
  end if;

  if not exists (
    select 1 from public.bm_stock_transactions
    where id = v_return_tx and transaction_type = 'receive'
  ) then
    raise exception 'L0-7: return transaction is not a receive';
  end if;
end;
$$;

select 'L0-7 PASS' as verification;
