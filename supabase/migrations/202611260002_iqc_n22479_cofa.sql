-- Manufacturer reference data (Roche CofA) for the HBV/HCV/HIV RMC control kit
-- lot N22479 (material 09040773190, exp 2027-12, CofA issued 2026-04-13), the lot
-- in use on cobas 6800 since 2026-11-02. Mirrors the N12044 block in
-- 202608270001_iqc_vl_baseline_policy.sql: Lower/Upper limits and Prec-SD only.
-- This CofA prints no target mean, so manufacturer_target_mean stays NULL.
-- Assigned Mean/SD are not touched: VL results are judged by the approved
-- instrument baseline, so no result is recalculated here.
-- Also links the three HPC/LPC lots to their stock lot (BM09 · N22479), as N12044 is.
-- Idempotent: safe to re-run in the Supabase SQL Editor.

with cofa(analyte_code, lower_limit, upper_limit, precision_sd) as (
  values
    ('HIV-VL (HPC)', 4.64::numeric, 5.94::numeric, 0.08::numeric),
    ('HIV-VL (LPC)', 2.04, 3.34, 0.05),
    ('HBV-VL (HPC)', 5.71, 7.01, 0.02),
    ('HBV-VL (LPC)', 1.70, 3.00, 0.05),
    ('HCV-VL (HPC)', 5.55, 6.85, 0.04),
    ('HCV-VL (LPC)', 1.74, 3.04, 0.06)
),
targets as (
  select lot.id as control_lot_id, analyte.id as analyte_id, lot.created_by,
         cofa.lower_limit, cofa.upper_limit, cofa.precision_sd
  from cofa
  join public.iqc_analytes analyte on analyte.code = cofa.analyte_code
  join public.iqc_control_materials material
    on material.name = split_part(cofa.analyte_code, ' ', 1) || ' Control'
   and material.level = 'HPC/LPC'
   and material.manufacturer = 'Roche'
  join public.iqc_control_lots lot
    on lot.control_material_id = material.id
   and lot.lot_number = 'N22479'
)
insert into public.iqc_control_specs (
  control_lot_id, analyte_id, created_by,
  manufacturer_lower, manufacturer_upper, manufacturer_precision_sd,
  manufacturer_target_mean, manufacturer_source_ref, change_reason
)
select control_lot_id, analyte_id, created_by,
       lower_limit, upper_limit, precision_sd,
       null, 'CofA_09040773190_N22479 (Roche, issued 2026-04-13)', 'บันทึกช่วงอ้างอิงจาก CofA lot N22479'
from targets
on conflict (control_lot_id, analyte_id) do update
set manufacturer_lower = excluded.manufacturer_lower,
    manufacturer_upper = excluded.manufacturer_upper,
    manufacturer_precision_sd = excluded.manufacturer_precision_sd,
    manufacturer_source_ref = excluded.manufacturer_source_ref,
    updated_at = now();

update public.iqc_control_lots lot
set stock_lot_id = stock.id
from public.iqc_control_materials material,
     public.bm_stock_lots stock
join public.bm_stock_items item on item.id = stock.item_id
where material.id = lot.control_material_id
  and material.level = 'HPC/LPC'
  and material.manufacturer = 'Roche'
  and lot.lot_number = 'N22479'
  and lot.stock_lot_id is null
  and item.item_code = 'BM09'
  and stock.lot_number = 'N22479';
