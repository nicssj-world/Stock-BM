do $$
declare
  actor_id uuid := '00000000-0000-0000-0000-000000000001';
  item_id uuid;
  vendor_uuid uuid;
begin
  select id into item_id from public.bm_stock_items where item_code = 'HARNESS-ITEM-001';
  insert into public.bm_vendors (code, name, created_by)
  values ('L0-VENDOR-001', 'L0 Vendor', actor_id)
  returning id into vendor_uuid;

  insert into public.bm_stock_item_vendors (stock_item_id, vendor_id, vendor_catalog_no, is_preferred, created_by)
  values (item_id, vendor_uuid, 'L0-CATALOG-001', true, actor_id);

  if not exists (
    select 1
    from public.bm_stock_item_vendors as m
    where m.stock_item_id = item_id
      and m.vendor_id = vendor_uuid
      and m.vendor_catalog_no = 'L0-CATALOG-001'
      and m.is_preferred
  ) then
    raise exception 'L0 vendor mapping was not persisted';
  end if;

  begin
    insert into public.bm_stock_item_vendors (stock_item_id, vendor_id, created_by)
    values (item_id, vendor_uuid, actor_id);
    raise exception 'L0 vendor mapping uniqueness was not enforced';
  exception when unique_violation then
    null;
  end;

  delete from public.bm_stock_item_vendors as m where m.stock_item_id = item_id and m.vendor_id = vendor_uuid;
  delete from public.bm_vendors where id = vendor_uuid;
  raise notice 'L0 VENDOR MAPPING PASS: reviewed item-vendor link CRUD and scoped uniqueness verified.';
end $$;
