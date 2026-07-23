-- Equipment plans are planned by month.  The final day of that month is the
-- internal deadline so reminders and overdue status never fire before it.
update public.bm_equipment_plans
set next_due_on = (date_trunc('month', next_due_on) + interval '1 month - 1 day')::date
where next_due_on <> (date_trunc('month', next_due_on) + interval '1 month - 1 day')::date;

create or replace function public.normalize_equipment_plan_due_month()
returns trigger
language plpgsql
as $$
begin
  new.next_due_on := (date_trunc('month', new.next_due_on) + interval '1 month - 1 day')::date;
  return new;
end;
$$;

drop trigger if exists bm_equipment_plans_due_month on public.bm_equipment_plans;
create trigger bm_equipment_plans_due_month
before insert or update of next_due_on on public.bm_equipment_plans
for each row execute function public.normalize_equipment_plan_due_month();
