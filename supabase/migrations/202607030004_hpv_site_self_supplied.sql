-- HPV sites: flag for hospitals that supply their own test kits
-- These sites still send samples to the lab but are not issued kits from the lab stock.
ALTER TABLE bm_hpv_sites
  ADD COLUMN IF NOT EXISTS self_supplied boolean NOT NULL DEFAULT false;
