insert into public.bm_stock_item_barcodes(stock_item_id, barcode, standard, created_by)
values
  ('30000000-0000-0000-0000-000000000001', 'AMBIGUOUS-GTIN-001', 'harness', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'AMBIGUOUS-GTIN-001', 'harness', '00000000-0000-0000-0000-000000000001')
on conflict (stock_item_id, barcode) do nothing;

do $$
begin
  if (select count(*) from public.bm_stock_item_barcodes where barcode = 'AMBIGUOUS-GTIN-001') <> 2 then
    raise exception 'L0-14 did not create two item barcode candidates';
  end if;
  raise notice 'L0-14 FIXTURE PASS: duplicate item barcode candidates are present.';
end $$;
