-- Additive normalized catalog lookup. This is intentionally non-unique because
-- duplicate catalog numbers require an explicit matcher decision.
alter table public.bm_stock_items add column if not exists catalog_no_normalized text
  generated always as (upper(regexp_replace(coalesce(catalog_no,''), '[^A-Za-z0-9]', '', 'g'))) stored;

create index if not exists bm_stock_items_catalog_normalized
  on public.bm_stock_items(catalog_no_normalized) where catalog_no_normalized <> '';

notify pgrst, 'reload schema';
