-- IQC VL baseline and policy profiles.
--
-- This migration is additive. It keeps the existing Assigned/LAB fields for
-- compatibility (especially CD4), while giving quantitative VL a separate,
-- instrument-scoped approved baseline. Historical results are not recalculated
-- here; an Admin applies a reviewed baseline through apply_iqc_vl_baseline().

alter table public.iqc_control_specs
  add column if not exists manufacturer_lower numeric,
  add column if not exists manufacturer_upper numeric,
  add column if not exists manufacturer_precision_sd numeric,
  add column if not exists manufacturer_target_mean numeric,
  add column if not exists manufacturer_target_sd numeric,
  add column if not exists manufacturer_source_ref text;

alter table public.iqc_control_specs
  drop constraint if exists iqc_control_specs_active_limit_check;
alter table public.iqc_control_specs
  add constraint iqc_control_specs_active_limit_check
    check (active_limit in ('assigned', 'lab', 'baseline'));

alter table public.iqc_result_values
  drop constraint if exists iqc_result_values_status_check;
alter table public.iqc_result_values
  add constraint iqc_result_values_status_check
    check (status in ('accepted', 'warning', 'investigate', 'rejected', 'not_evaluated'));

alter table public.iqc_result_values
  add column if not exists evaluation_baseline_id uuid,
  add column if not exists evaluation_policy_profile text,
  add column if not exists evaluated_at timestamptz;

alter table public.iqc_result_values
  drop constraint if exists iqc_result_values_evaluation_policy_profile_check;
alter table public.iqc_result_values
  add constraint iqc_result_values_evaluation_policy_profile_check
    check (evaluation_policy_profile is null or evaluation_policy_profile in ('cd4-legacy', 'vl-standard-v1'));

-- Lot Verification consumes an approved VL baseline when its verification is
-- instrument-scoped. Keep the existing Assigned/LAB/manual values for CD4 and
-- legacy records, but allow the source to be labelled explicitly.
alter table public.lotverif_parallel_rows
  drop constraint if exists lotverif_parallel_rows_stats_source_check;
alter table public.lotverif_parallel_rows
  add constraint lotverif_parallel_rows_stats_source_check
    check (stats_source in ('assigned', 'lab', 'baseline', 'manual'));

create table if not exists public.iqc_baselines (
  id uuid primary key default gen_random_uuid(),
  control_lot_id uuid not null references public.iqc_control_lots(id),
  analyte_id uuid not null references public.iqc_analytes(id),
  instrument_id uuid not null references public.iqc_instruments(id),
  baseline_type text not null check (baseline_type in ('lab_observed', 'observed_seed')),
  state text not null default 'draft' check (state in ('draft', 'approved', 'superseded')),
  mean numeric,
  sd numeric check (sd is null or sd >= 0),
  n integer not null default 0 check (n >= 0),
  expected_qualitative text,
  candidate_n integer not null default 0 check (candidate_n >= 0),
  excluded_n integer not null default 0 check (excluded_n >= 0),
  source_ref text,
  reason text,
  version integer not null check (version > 0),
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.nipt_users(id),
  approved_at timestamptz,
  check ((mean is null and sd is null) or (mean is not null and sd is not null and sd > 0)),
  check (n <= candidate_n),
  unique (control_lot_id, analyte_id, instrument_id, version)
);

create unique index if not exists iqc_baselines_one_approved_scope
  on public.iqc_baselines(control_lot_id, analyte_id, instrument_id)
  where state = 'approved';

create index if not exists iqc_baselines_scope
  on public.iqc_baselines(control_lot_id, analyte_id, instrument_id, state);

create table if not exists public.iqc_baseline_candidates (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references public.iqc_baselines(id) on delete cascade,
  result_id uuid not null references public.iqc_result_values(id),
  included boolean not null default true,
  exclusion_reason text,
  unique (baseline_id, result_id),
  check (included or nullif(trim(exclusion_reason), '') is not null)
);

create index if not exists iqc_baseline_candidates_result
  on public.iqc_baseline_candidates(result_id);

alter table public.iqc_result_values
  drop constraint if exists iqc_result_values_evaluation_baseline_fk;

alter table public.iqc_result_values
  add constraint iqc_result_values_evaluation_baseline_fk
  foreign key (evaluation_baseline_id) references public.iqc_baselines(id);

alter table public.iqc_control_plans
  add column if not exists policy_profile text not null default 'cd4-legacy';

alter table public.iqc_control_plans
  drop constraint if exists iqc_control_plans_policy_profile_check;
alter table public.iqc_control_plans
  add constraint iqc_control_plans_policy_profile_check
    check (policy_profile in ('cd4-legacy', 'vl-standard-v1'));

update public.iqc_control_plans plan
set policy_profile = 'vl-standard-v1', updated_at = now()
from public.iqc_analytes analyte
where analyte.id = plan.analyte_id
  and analyte.code ilike '%-VL%';

-- Manufacturer reference data for the Roche N12044 control lot used by the
-- imported Cobas 8800 VL history. HCV HPC has no explicit target mean in the
-- certificate, so its target remains NULL; the historical 6.13 value must not
-- be presented as a manufacturer-assigned target.
update public.iqc_control_specs spec
set manufacturer_lower = case
      when analyte.code ilike 'HIV-VL%HPC%' then 4.43
      when analyte.code ilike 'HIV-VL%LPC%' then 1.81
      when analyte.code ilike 'HBV-VL%HPC%' then 5.62
      when analyte.code ilike 'HBV-VL%LPC%' then 1.66
      when analyte.code ilike 'HCV-VL%HPC%' then 5.48
      when analyte.code ilike 'HCV-VL%LPC%' then 1.68
      else spec.manufacturer_lower
    end,
    manufacturer_upper = case
      when analyte.code ilike 'HIV-VL%HPC%' then 5.73
      when analyte.code ilike 'HIV-VL%LPC%' then 3.11
      when analyte.code ilike 'HBV-VL%HPC%' then 6.92
      when analyte.code ilike 'HBV-VL%LPC%' then 2.96
      when analyte.code ilike 'HCV-VL%HPC%' then 6.78
      when analyte.code ilike 'HCV-VL%LPC%' then 2.98
      else spec.manufacturer_upper
    end,
    manufacturer_precision_sd = case
      when analyte.code ilike 'HIV-VL%HPC%' then 0.08
      when analyte.code ilike 'HIV-VL%LPC%' then 0.07
      when analyte.code ilike 'HBV-VL%HPC%' then 0.02
      when analyte.code ilike 'HBV-VL%LPC%' then 0.03
      when analyte.code ilike 'HCV-VL%HPC%' then 0.04
      when analyte.code ilike 'HCV-VL%LPC%' then 0.06
      else spec.manufacturer_precision_sd
    end,
    manufacturer_target_mean = case
      when analyte.code ilike 'HIV-VL%HPC%' then 5.08
      when analyte.code ilike 'HIV-VL%LPC%' then 2.46
      when analyte.code ilike 'HBV-VL%HPC%' then 6.27
      when analyte.code ilike 'HBV-VL%LPC%' then 2.31
      when analyte.code ilike 'HCV-VL%LPC%' then 2.33
      when analyte.code ilike 'HCV-VL%HPC%' then null
      else spec.manufacturer_target_mean
    end,
    manufacturer_source_ref = 'CofA_09040773190_N12044_20270930_NA_040016033157_N_20260105_170756.PDF',
    updated_at = now()
from public.iqc_control_lots lot,
     public.iqc_analytes analyte
where lot.id = spec.control_lot_id
  and analyte.id = spec.analyte_id
  and lot.lot_number = 'N12044'
  and analyte.code ilike '%-VL%'
  and analyte.code not ilike '%Normal%';

alter table public.iqc_baselines enable row level security;
alter table public.iqc_baseline_candidates enable row level security;

drop policy if exists iqc_baselines_read on public.iqc_baselines;
create policy iqc_baselines_read on public.iqc_baselines
  for select using (public.current_bm_role() is not null);

drop policy if exists iqc_baseline_candidates_read on public.iqc_baseline_candidates;
create policy iqc_baseline_candidates_read on public.iqc_baseline_candidates
  for select using (public.current_bm_role() is not null);

grant select on public.iqc_baselines, public.iqc_baseline_candidates to authenticated;

-- The API calls this through the service-role client only after its actor check.
-- The function repeats the Admin check so a crafted request cannot apply a
-- baseline merely by setting a client-side flag. p_lot_evaluations contains
-- every non-void VL result in the lot, allowing approval and cross-level
-- recalculation to commit atomically.
drop function if exists public.apply_iqc_vl_baseline(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, text, jsonb, jsonb);

create or replace function public.apply_iqc_vl_baseline(
  p_control_lot_id uuid,
  p_analyte_id uuid,
  p_instrument_id uuid,
  p_actor uuid,
  p_baseline_type text,
  p_mean numeric,
  p_sd numeric,
  p_expected_qualitative text,
  p_source_ref text,
  p_reason text,
  p_candidates jsonb,
  p_evaluations jsonb,
  p_lot_evaluations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_data_type text;
  v_policy text;
  v_version integer;
  v_baseline_id uuid;
  v_candidate_n integer := 0;
  v_included_n integer := 0;
  v_excluded_n integer := 0;
  v_updated_n integer := 0;
  v_candidate record;
  v_evaluation record;
  v_old record;
  v_new_status text;
  v_new_z numeric;
  v_new_rules text[];
  v_target_baseline_id uuid;
begin
  select access.role into v_role
  from public.bm_user_access access
  join public.nipt_users users on users.id = access.user_id
  where access.user_id = p_actor
    and access.role = 'Admin'
    and access.is_active
    and users.is_active;
  if v_role is null then
    raise exception 'Admin permission required to apply IQC baseline';
  end if;

  select analyte.data_type,
         case when analyte.code ilike '%-VL%' then 'vl-standard-v1' else 'cd4-legacy' end
    into v_data_type, v_policy
  from public.iqc_analytes analyte
  where analyte.id = p_analyte_id and analyte.is_active;
  if v_data_type is null then raise exception 'Active IQC analyte not found'; end if;
  if v_policy <> 'vl-standard-v1' then raise exception 'Baseline apply is limited to VL analytes'; end if;

  if not exists (
    select 1 from public.iqc_control_lots lot
    where lot.id = p_control_lot_id and lot.is_active
  ) then raise exception 'Active control lot not found'; end if;
  if not exists (
    select 1 from public.iqc_instruments instrument
    where instrument.id = p_instrument_id and instrument.is_active
  ) then raise exception 'Active IQC instrument not found'; end if;
  if not exists (
    select 1
    from public.bm_equipment_module_links link
    join public.bm_equipment equipment on equipment.id = link.equipment_id
    where link.module = 'iqc'
      and link.entity_type = 'instrument'
      and link.entity_id = p_instrument_id
      and equipment.status <> 'decommissioned'
  ) then raise exception 'IQC instrument must be linked to active Equipment'; end if;
  if p_baseline_type not in ('lab_observed', 'observed_seed') then raise exception 'Invalid baseline type'; end if;
  if (v_data_type = 'quantitative' and p_baseline_type <> 'lab_observed')
     or (v_data_type = 'qualitative' and p_baseline_type <> 'observed_seed') then
    raise exception 'Baseline type does not match analyte data type';
  end if;

  if v_data_type = 'quantitative' then
    if p_mean is null or p_sd is null or p_sd <= 0 then raise exception 'Quantitative baseline requires mean and SD'; end if;
  else
    if nullif(trim(coalesce(p_expected_qualitative, '')), '') is null then raise exception 'Qualitative baseline requires expected result'; end if;
    p_mean := null;
    p_sd := null;
  end if;

  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_evaluations, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_lot_evaluations, '[]'::jsonb)) <> 'array' then
    raise exception 'Baseline candidates and evaluations must be arrays';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
    where candidate.result_id is null or candidate.included is null
  ) then
    raise exception 'Every baseline candidate must have a result ID and included flag';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, status text, z numeric, violated_rules jsonb)
    where evaluation.result_id is null
       or evaluation.status is null
       or jsonb_typeof(coalesce(evaluation.violated_rules, '[]'::jsonb)) <> 'array'
  ) then
    raise exception 'Every baseline evaluation must have a result ID, status, and rules array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_lot_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, analyte_id uuid, status text, z numeric, violated_rules jsonb)
    where evaluation.result_id is null
       or evaluation.analyte_id is null
       or evaluation.status is null
       or jsonb_typeof(coalesce(evaluation.violated_rules, '[]'::jsonb)) <> 'array'
  ) then
    raise exception 'Every lot evaluation must have a result ID, analyte ID, status, and rules array';
  end if;

  select count(*) into v_candidate_n
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text);
  select count(*) into v_included_n
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
  where candidate.included;
  v_excluded_n := v_candidate_n - v_included_n;

  if v_data_type = 'quantitative' and v_included_n < 20 then
    raise exception 'At least 20 included results are required before activating a quantitative baseline';
  end if;

  if v_data_type = 'quantitative' and exists (
    select 1
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
    join public.iqc_result_values value on value.id = candidate.result_id
    where candidate.included and (value.stat_value is null or value.stat_value::text in ('NaN', 'Infinity', '-Infinity'))
  ) then
    raise exception 'Every included quantitative result must have a finite statistic value';
  end if;

  if v_data_type = 'qualitative' and not exists (
    select 1
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
    join public.iqc_result_values value on value.id = candidate.result_id
    where candidate.included and nullif(trim(value.qualitative_value), '') is not null
  ) then
    raise exception 'An observed qualitative result is required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
    left join public.iqc_result_values value on value.id = candidate.result_id
    left join public.iqc_runs run on run.id = value.run_id
    where value.id is null
       or value.control_lot_id <> p_control_lot_id
       or value.analyte_id <> p_analyte_id
       or value.is_voided
       or run.instrument_id is distinct from p_instrument_id
       or (not candidate.included and nullif(trim(candidate.exclusion_reason), '') is null)
  ) then
    raise exception 'Baseline candidate is outside the selected lot, analyte, instrument, or has no exclusion reason';
  end if;

  if exists (
    select 1
    from public.iqc_result_values value
    join public.iqc_runs run on run.id = value.run_id
    where value.control_lot_id = p_control_lot_id
      and value.analyte_id = p_analyte_id
      and not value.is_voided
      and run.instrument_id = p_instrument_id
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
        where candidate.result_id = value.id
      )
  ) then
    raise exception 'Every non-void result in the selected instrument scope must be reviewed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
    where not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, status text, z numeric, violated_rules jsonb)
      where evaluation.result_id = candidate.result_id
    )
  ) then
    raise exception 'Every baseline candidate must have a recalculated evaluation';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, status text, z numeric, violated_rules jsonb)
    where not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text)
      where candidate.result_id = evaluation.result_id
    )
  ) then
    raise exception 'Every baseline evaluation must correspond to a reviewed candidate';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, status text, z numeric, violated_rules jsonb)
    left join public.iqc_result_values value on value.id = evaluation.result_id
    left join public.iqc_runs run on run.id = value.run_id
    where value.id is null
       or value.control_lot_id <> p_control_lot_id
       or value.analyte_id <> p_analyte_id
       or value.is_voided
       or run.instrument_id is distinct from p_instrument_id
       or evaluation.status not in ('accepted', 'warning', 'investigate', 'rejected', 'not_evaluated')
  ) then
    raise exception 'Baseline evaluation is outside the selected scope or has an invalid status';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_lot_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, analyte_id uuid, status text, z numeric, violated_rules jsonb)
    left join public.iqc_result_values value on value.id = evaluation.result_id
    left join public.iqc_analytes analyte on analyte.id = value.analyte_id
    where value.id is null
       or value.control_lot_id <> p_control_lot_id
       or value.is_voided
       or value.analyte_id <> evaluation.analyte_id
       or analyte.code not ilike '%-VL%'
       or evaluation.status not in ('accepted', 'warning', 'investigate', 'rejected', 'not_evaluated')
  ) then
    raise exception 'Lot evaluation is outside the selected VL lot or has an invalid status';
  end if;

  if exists (
    select 1
    from public.iqc_result_values value
    join public.iqc_analytes analyte on analyte.id = value.analyte_id
    where value.control_lot_id = p_control_lot_id
      and not value.is_voided
      and analyte.code ilike '%-VL%'
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(p_lot_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, analyte_id uuid, status text, z numeric, violated_rules jsonb)
        where evaluation.result_id = value.id
      )
  ) then
    raise exception 'Every non-void VL result in the lot must have a recalculated evaluation';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.iqc_baselines
  where control_lot_id = p_control_lot_id
    and analyte_id = p_analyte_id
    and instrument_id = p_instrument_id;

  update public.iqc_baselines
  set state = 'superseded'
  where control_lot_id = p_control_lot_id
    and analyte_id = p_analyte_id
    and instrument_id = p_instrument_id
    and state = 'approved';

  insert into public.iqc_baselines(
    control_lot_id, analyte_id, instrument_id, baseline_type, state,
    mean, sd, n, expected_qualitative, candidate_n, excluded_n,
    source_ref, reason, version, created_by, approved_by, approved_at
  ) values (
    p_control_lot_id, p_analyte_id, p_instrument_id, p_baseline_type, 'approved',
    p_mean, p_sd, v_included_n, nullif(trim(p_expected_qualitative), ''),
    v_candidate_n, v_excluded_n, nullif(trim(p_source_ref), ''),
    nullif(trim(p_reason), ''), v_version, p_actor, p_actor, now()
  ) returning id into v_baseline_id;

  insert into public.iqc_baseline_candidates(baseline_id, result_id, included, exclusion_reason)
  select v_baseline_id, candidate.result_id, candidate.included, nullif(trim(candidate.exclusion_reason), '')
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as candidate(result_id uuid, included boolean, exclusion_reason text);

  insert into public.iqc_control_specs(
    control_lot_id, analyte_id, expected_qualitative, active_limit,
    created_by, updated_by, updated_at
  ) values (
    p_control_lot_id, p_analyte_id, nullif(trim(p_expected_qualitative), ''),
    'baseline', p_actor, p_actor, now()
  )
  on conflict (control_lot_id, analyte_id) do update set
    expected_qualitative = excluded.expected_qualitative,
    active_limit = excluded.active_limit,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  for v_evaluation in
    select evaluation.result_id, evaluation.analyte_id, evaluation.status, evaluation.z, evaluation.violated_rules
    from jsonb_to_recordset(coalesce(p_lot_evaluations, '[]'::jsonb)) as evaluation(result_id uuid, analyte_id uuid, status text, z numeric, violated_rules jsonb)
  loop
    select status, z_score, violated_rules into v_old
    from public.iqc_result_values
    where id = v_evaluation.result_id;
    v_new_status := v_evaluation.status;
    v_new_z := v_evaluation.z;
    v_target_baseline_id := null;
    select baseline.id into v_target_baseline_id
    from public.iqc_baselines baseline
    join public.iqc_runs run on run.id = (
      select value.run_id from public.iqc_result_values value where value.id = v_evaluation.result_id
    )
    where baseline.control_lot_id = p_control_lot_id
      and baseline.analyte_id = v_evaluation.analyte_id
      and baseline.instrument_id = run.instrument_id
      and baseline.state = 'approved'
    order by baseline.version desc
    limit 1;
    v_new_rules := coalesce(
      array(select jsonb_array_elements_text(coalesce(v_evaluation.violated_rules, '[]'::jsonb))),
      '{}'::text[]
    );
    update public.iqc_result_values
    set status = v_new_status,
        z_score = v_new_z,
        violated_rules = v_new_rules,
        evaluation_baseline_id = v_target_baseline_id,
        evaluation_policy_profile = v_policy,
        evaluated_at = now()
    where id = v_evaluation.result_id;
    v_updated_n := v_updated_n + 1;
    insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
    values (
      p_actor, 'iqc.result.recalculate', 'iqc-result', v_evaluation.result_id,
      jsonb_build_object(
        'baselineId', v_target_baseline_id,
        'baselineVersion', case when v_target_baseline_id = v_baseline_id then v_version else null end,
        'old', jsonb_build_object('status', v_old.status, 'zScore', v_old.z_score, 'violatedRules', v_old.violated_rules),
        'new', jsonb_build_object('status', v_new_status, 'zScore', v_new_z, 'violatedRules', v_new_rules)
      )
    );
  end loop;

  insert into public.bm_audit_logs(actor_id, action, entity_type, entity_id, detail)
  values (
    p_actor, 'iqc.baseline.approve', 'iqc-baseline', v_baseline_id,
    jsonb_build_object(
      'controlLotId', p_control_lot_id,
      'analyteId', p_analyte_id,
      'instrumentId', p_instrument_id,
      'version', v_version,
      'baselineType', p_baseline_type,
      'mean', p_mean,
      'sd', p_sd,
      'candidateN', v_candidate_n,
      'includedN', v_included_n,
      'excludedN', v_excluded_n,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'baselineId', v_baseline_id,
    'version', v_version,
    'candidateN', v_candidate_n,
    'includedN', v_included_n,
    'excludedN', v_excluded_n,
    'updatedN', v_updated_n
  );
end;
$$;

revoke all on function public.apply_iqc_vl_baseline(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_iqc_vl_baseline(uuid, uuid, uuid, uuid, text, numeric, numeric, text, text, text, jsonb, jsonb, jsonb)
  to service_role;
