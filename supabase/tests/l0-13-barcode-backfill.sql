do $$
declare
  item_source text;
  lot_source text;
  item_rows_before integer;
  lot_rows_before integer;
  item_rows_after integer;
  lot_rows_after integer;
begin
  select manufacturer_barcode into item_source
  from public.bm_stock_items
  where id = '30000000-0000-0000-0000-000000000001';

  select manufacturer_barcode into lot_source
  from public.bm_stock_lots
  where id = '40000000-0000-0000-0000-000000000001';

  if item_source is distinct from 'ITEM-BARCODE-001' then
    raise exception 'L0-13 item source barcode changed before backfill';
  end if;
  if lot_source is distinct from 'LOT-BARCODE-001' then
    raise exception 'L0-13 lot source barcode changed before backfill';
  end if;

  select count(*) into item_rows_before
  from public.bm_stock_item_barcodes
  where stock_item_id = '30000000-0000-0000-0000-000000000001'
    and barcode = item_source;
  select count(*) into lot_rows_before
  from public.bm_stock_lot_barcodes
  where stock_lot_id = '40000000-0000-0000-0000-000000000001'
    and barcode = lot_source;

  insert into public.bm_stock_item_barcodes(stock_item_id, barcode, standard, created_by)
  select id, manufacturer_barcode, 'legacy', created_by
  from public.bm_stock_items
  where manufacturer_barcode is not null
  on conflict (stock_item_id, barcode) do nothing;

  insert into public.bm_stock_lot_barcodes(stock_lot_id, barcode, standard, created_by)
  select id, manufacturer_barcode, 'legacy', created_by
  from public.bm_stock_lots
  where manufacturer_barcode is not null
  on conflict (stock_lot_id, barcode) do nothing;

  select count(*) into item_rows_after
  from public.bm_stock_item_barcodes
  where stock_item_id = '30000000-0000-0000-0000-000000000001'
    and barcode = item_source;
  select count(*) into lot_rows_after
  from public.bm_stock_lot_barcodes
  where stock_lot_id = '40000000-0000-0000-0000-000000000001'
    and barcode = lot_source;

  if item_rows_after <> 1 or lot_rows_after <> 1 then
    raise exception 'L0-13 first idempotent backfill did not produce one row per source';
  end if;

  insert into public.bm_stock_item_barcodes(stock_item_id, barcode, standard, created_by)
  select id, manufacturer_barcode, 'legacy', created_by
  from public.bm_stock_items
  where manufacturer_barcode is not null
  on conflict (stock_item_id, barcode) do nothing;

  insert into public.bm_stock_lot_barcodes(stock_lot_id, barcode, standard, created_by)
  select id, manufacturer_barcode, 'legacy', created_by
  from public.bm_stock_lots
  where manufacturer_barcode is not null
  on conflict (stock_lot_id, barcode) do nothing;

  if (select count(*) from public.bm_stock_item_barcodes) <> (select count(*) from public.bm_stock_items where manufacturer_barcode is not null)
    or (select count(*) from public.bm_stock_lot_barcodes) <> (select count(*) from public.bm_stock_lots where manufacturer_barcode is not null) then
    raise exception 'L0-13 second idempotent backfill changed row counts';
  end if;
  if item_source is distinct from (select manufacturer_barcode from public.bm_stock_items where id = '30000000-0000-0000-0000-000000000001')
    or lot_source is distinct from (select manufacturer_barcode from public.bm_stock_lots where id = '40000000-0000-0000-0000-000000000001') then
    raise exception 'L0-13 source barcode changed during backfill';
  end if;

  raise notice 'L0-13 PASS: barcode backfill is idempotent and legacy source columns are unchanged.';
end $$;
