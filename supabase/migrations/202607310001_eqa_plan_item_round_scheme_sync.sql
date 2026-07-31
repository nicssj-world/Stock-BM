-- Rounds cache the scheme selected by their annual-plan item. Reconcile rows
-- created before plan-item edits propagated to that cache, so the Rounds / Results
-- tab immediately uses the same scheme as the annual plan.
update public.eqa_rounds as round
set scheme_id = item.scheme_id,
    updated_at = now()
from public.eqa_plan_items as item
where round.plan_item_id = item.id
  and round.scheme_id is distinct from item.scheme_id;
