-- Optional per-item default issue quantity, prefilled when cutting (issuing) stock —
-- e.g. consumables typically issued 1 unit at a time. NULL = no default (blank field).
alter table public.bm_stock_items
  add column default_issue_qty numeric check (default_issue_qty is null or default_issue_qty > 0);
