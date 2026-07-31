-- A manually entered real-world round may predate automatic generation. Match
-- it to the planned month (rather than treating it as sequence 1), then reuse
-- the placeholder it displaced for the missing earlier occurrence.
create temporary table eqa_round_sequence_repairs on commit drop as
with numbered_occurrences as (
  select
    item.id as plan_item_id,
    item.sample_set_name,
    plan.plan_year,
    occurrence.planned_month,
    row_number() over (partition by item.id order by occurrence.sort_order, occurrence.planned_month)::integer as sequence_no
  from public.eqa_plan_items as item
  join public.eqa_annual_plans as plan on plan.id = item.plan_id
  join public.eqa_plan_occurrences as occurrence on occurrence.plan_item_id = item.id
), candidates as (
  select
    actual.id as actual_round_id,
    placeholder.id as placeholder_round_id,
    actual.plan_item_id,
    actual.sequence_no as source_sequence_no,
    target.sequence_no as target_sequence_no,
    target.plan_year,
    source.planned_month as source_month
  from public.eqa_rounds as actual
  join public.eqa_plan_items as item on item.id = actual.plan_item_id
  join numbered_occurrences as target
    on target.plan_item_id = actual.plan_item_id
    and target.planned_month = extract(month from actual.sample_received_date)::integer
  join numbered_occurrences as source
    on source.plan_item_id = actual.plan_item_id
    and source.sequence_no = actual.sequence_no
  join public.eqa_rounds as placeholder
    on placeholder.plan_item_id = actual.plan_item_id
    and placeholder.sequence_no = target.sequence_no
    and placeholder.status = 'scheduled'
  where actual.status <> 'scheduled'
    and actual.round_label = item.sample_set_name
    and actual.sequence_no is distinct from target.sequence_no
)
select * from candidates;

-- Release the source sequence before swapping it with the placeholder. The
-- partial unique index on (plan_item_id, sequence_no) therefore remains valid.
update public.eqa_rounds as round
set sequence_no = null,
    updated_at = now()
from eqa_round_sequence_repairs as repair
where round.id = repair.actual_round_id;

update public.eqa_rounds as round
set sequence_no = repair.source_sequence_no,
    round_label = format('ครั้งที่ %s/%s', repair.source_sequence_no, repair.plan_year + 543),
    result_due_date = (make_date(repair.plan_year, repair.source_month, 1) + interval '1 month - 1 day')::date,
    updated_at = now()
from eqa_round_sequence_repairs as repair
where round.id = repair.placeholder_round_id;

update public.eqa_rounds as round
set sequence_no = repair.target_sequence_no,
    round_label = format('ครั้งที่ %s/%s', repair.target_sequence_no, repair.plan_year + 543),
    updated_at = now()
from eqa_round_sequence_repairs as repair
where round.id = repair.actual_round_id;
