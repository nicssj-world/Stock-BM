do $$
declare
  vendors_rls boolean;
  mappings_rls boolean;
  vendor_code_unique boolean;
  vendor_lookup_index boolean;
begin
  select relrowsecurity into vendors_rls
  from pg_class
  where oid = 'public.bm_vendors'::regclass;
  select relrowsecurity into mappings_rls
  from pg_class
  where oid = 'public.bm_stock_item_vendors'::regclass;
  if not vendors_rls or not mappings_rls then
    raise exception 'L0 vendor schema RLS is not enabled on both tables';
  end if;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bm_vendors'::regclass
      and contype = 'u'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.bm_vendors'::regclass and attname = 'code')::smallint]
  ) into vendor_code_unique;
  if not vendor_code_unique then
    raise exception 'L0 vendor code unique constraint is missing';
  end if;

  select exists (
    select 1
    from pg_class
    where relname = 'bm_stock_item_vendors_vendor'
      and relkind = 'i'
  ) into vendor_lookup_index;
  if not vendor_lookup_index then
    raise exception 'L0 vendor lookup index is missing';
  end if;

  raise notice 'L0 VENDOR PASS: RLS, unique vendor code, mapping constraints, and index verified.';
end $$;
