-- Replace table-level unique constraint on code with a partial unique index
-- so that inactive locations do not block reuse of the same code.
alter table public.bm_stock_locations drop constraint bm_stock_locations_code_key;

create unique index bm_stock_locations_code_active_idx
  on public.bm_stock_locations (code)
  where is_active = true;
