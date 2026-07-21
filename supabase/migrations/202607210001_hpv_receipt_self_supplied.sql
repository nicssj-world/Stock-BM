-- Move the "self-supplied" flag from the site level to the receive log level.
-- A site can send back both centrally-issued and self-supplied kits over time,
-- so the flag now applies per receipt and only self-supplied receipts are
-- excluded from the outstanding-kit calculation.
alter table public.bm_hpv_site_receipts
  add column if not exists self_supplied boolean not null default false;

alter table public.bm_hpv_sites
  drop column if exists self_supplied;

notify pgrst, 'reload schema';
