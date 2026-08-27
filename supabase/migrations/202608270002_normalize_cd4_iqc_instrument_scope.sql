-- Normalize historical CD4 IQC runs after an administrator confirmed that
-- the instrument group was selected incorrectly. CD4 is one lot-level series
-- on the registered FACSLyric instrument; preserve all results and void flags.
-- The target is derived from the active CD4 control plans so this remains safe
-- across environments without hard-coding a generated instrument id.

do $$
declare
  v_target_instrument_id uuid;
begin
  select (array_agg(distinct plan.instrument_id))[1]
    into v_target_instrument_id
  from public.iqc_control_plans plan
  join public.iqc_analytes analyte on analyte.id = plan.analyte_id
  where plan.is_active
    and analyte.code in ('%CD3', '%CD4', 'AbsCD3', 'AbsCD4')
  having count(distinct plan.instrument_id) = 1;

  if v_target_instrument_id is null then
    raise exception 'CD4 normalization requires exactly one active CD4 control-plan instrument';
  end if;

  insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
  select
    null,
    'iqc.run.instrument.normalize',
    'iqc-run',
    run.id,
    jsonb_build_object(
      'reason', 'Admin-confirmed human error: CD4 run was assigned to the wrong instrument group',
      'scope', 'CD4 lot-level chart',
      'oldInstrumentId', run.instrument_id,
      'newInstrumentId', v_target_instrument_id,
      'runDatetime', run.run_datetime
    )
  from public.iqc_runs run
  where run.instrument_id is distinct from v_target_instrument_id
    and exists (
      select 1
      from public.iqc_result_values value
      join public.iqc_analytes analyte on analyte.id = value.analyte_id
      where value.run_id = run.id
        and analyte.code in ('%CD3', '%CD4', 'AbsCD3', 'AbsCD4')
    );

  update public.iqc_runs run
  set instrument_id = v_target_instrument_id
  where run.instrument_id is distinct from v_target_instrument_id
    and exists (
      select 1
      from public.iqc_result_values value
      join public.iqc_analytes analyte on analyte.id = value.analyte_id
      where value.run_id = run.id
        and analyte.code in ('%CD3', '%CD4', 'AbsCD3', 'AbsCD4')
    );
end $$;
