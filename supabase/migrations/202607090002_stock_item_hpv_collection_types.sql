-- Classify HPV-linked stock items by collection kit type for HPV Management.

alter table public.bm_stock_items
  add column if not exists hpv_self_collected boolean not null default false,
  add column if not exists hpv_clinician_collected boolean not null default false;

update public.bm_stock_items
set
  hpv_self_collected = true,
  hpv_clinician_collected = true
where is_hpv = true
  and hpv_self_collected = false
  and hpv_clinician_collected = false;

notify pgrst, 'reload schema';
