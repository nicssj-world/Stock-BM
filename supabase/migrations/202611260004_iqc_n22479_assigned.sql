-- Assigned Mean/SD (log10) for control kit lot N22479, following the convention
-- already used for lot N12044: Mean = midpoint of the CofA Lower/Upper limits,
-- SD = CofA Prec-SD. The CofA prints no target mean, so these are derived values.
-- VL results are still judged only by an approved QC baseline: nothing is
-- recalculated. Only fills empty specs, so later manual edits are never overwritten.
-- Requires 202611260002_iqc_n22479_cofa.sql. Idempotent.

update public.iqc_control_specs spec
set assigned_mean = round((spec.manufacturer_lower + spec.manufacturer_upper) / 2, 2),
    assigned_sd = spec.manufacturer_precision_sd,
    change_reason = 'Mean = กึ่งกลางช่วง CofA, SD = Prec-SD (lot N22479)',
    updated_by = spec.created_by,
    updated_at = now()
from public.iqc_control_lots lot,
     public.iqc_control_materials material
where lot.id = spec.control_lot_id
  and material.id = lot.control_material_id
  and material.manufacturer = 'Roche'
  and material.level = 'HPC/LPC'
  and lot.lot_number = 'N22479'
  and spec.assigned_mean is null
  and spec.assigned_sd is null
  and spec.manufacturer_lower is not null
  and spec.manufacturer_upper is not null
  and spec.manufacturer_precision_sd is not null;
