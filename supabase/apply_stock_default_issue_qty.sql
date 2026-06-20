-- ============================================================
-- Molecular-CBH QMS — default issue qty (IDEMPOTENT)
-- Apply in Supabase Dashboard > SQL Editor.
-- Migration 202606210004. Safe to re-run (add column if not exists).
-- ============================================================
alter table public.bm_stock_items
  add column if not exists default_issue_qty numeric check (default_issue_qty is null or default_issue_qty > 0);
