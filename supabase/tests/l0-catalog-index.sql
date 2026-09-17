do $$
declare
  normalized text;
  generated_kind "char";
  index_is_unique boolean;
begin
  select catalog_no_normalized into normalized
  from public.bm_stock_items
  where id = '30000000-0000-0000-0000-000000000001';
  if normalized is distinct from 'CAT001' then
    raise exception 'L0 catalog index generated value mismatch: %', normalized;
  end if;

  select attgenerated into generated_kind
  from pg_attribute
  where attrelid = 'public.bm_stock_items'::regclass
    and attname = 'catalog_no_normalized'
    and not attisdropped;
  if generated_kind is distinct from 's' then
    raise exception 'L0 catalog index column is not stored generated';
  end if;

  select indexrelid::regclass::text, indisunique
    into strict normalized, index_is_unique
  from pg_index
  where indexrelid = 'public.bm_stock_items_catalog_normalized'::regclass;
  if index_is_unique then
    raise exception 'L0 catalog index must remain non-unique';
  end if;

  raise notice 'L0 CATALOG PASS: generated normalized catalog column and non-unique index verified in Postgres.';
end $$;
