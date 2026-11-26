-- Lab decision (2026-11-26): until a QC baseline is approved, the Assigned SD of
-- control kit lot N22479 is (CofA Upper - Lower) / 6, so that Mean +/- 3SD equals
-- the CofA range. Replaces the Prec-SD set by 202611260004. Mean is unchanged and
-- VL results are not recalculated. Only replaces the untouched Prec-SD value.
-- Idempotent.

update public.iqc_control_specs spec
set assigned_sd = round((spec.manufacturer_upper - spec.manufacturer_lower) / 6, 3),
    change_reason = 'SD = (CofA Upper - Lower) / 6 (lot N22479)',
    updated_by = spec.created_by,
    updated_at = now()
from public.iqc_control_lots lot,
     public.iqc_control_materials material
where lot.id = spec.control_lot_id
  and material.id = lot.control_material_id
  and material.manufacturer = 'Roche'
  and material.level = 'HPC/LPC'
  and lot.lot_number = 'N22479'
  and spec.assigned_sd = spec.manufacturer_precision_sd;
