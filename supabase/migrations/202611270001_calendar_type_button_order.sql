-- Keep type button order independent of the original event display sort_order.
-- Existing rows keep their original order until an administrator explicitly reorders them.
alter table public.bm_calendar_types add column button_sort_order integer;

create function public.bm_reorder_calendar_type_buttons(
  p_calendar_id uuid, p_ids uuid[], p_expected_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_ids uuid[];
begin
  if p_calendar_id is null or p_ids is null or p_expected_ids is null
     or cardinality(p_ids) < 1 or cardinality(p_ids) > 1000 then
    raise exception 'Invalid type list' using errcode = '22023';
  end if;

  -- Serialize with type creation, deletion and other reorder requests.
  lock table public.bm_calendar_types in share row exclusive mode;

  select coalesce(array_agg(t.id order by t.button_sort_order asc nulls last, t.sort_order, t.name, t.id), '{}'::uuid[])
    into current_ids
    from public.bm_calendar_types t
    where t.calendar_id = p_calendar_id;

  if current_ids is distinct from p_expected_ids then
    raise exception 'Type list changed' using errcode = '40001';
  end if;

  if cardinality(p_ids) <> cardinality(current_ids)
     or (select count(distinct x.id) from unnest(p_ids) as x(id)) <> cardinality(current_ids)
     or not (p_ids <@ current_ids) then
    raise exception 'Invalid type list' using errcode = '22023';
  end if;

  update public.bm_calendar_types t
    set button_sort_order = (x.position * 10)::integer
    from unnest(p_ids) with ordinality as x(id, position)
    where t.id = x.id and t.calendar_id = p_calendar_id;
end;
$$;

revoke all on function public.bm_reorder_calendar_type_buttons(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.bm_reorder_calendar_type_buttons(uuid, uuid[], uuid[]) to service_role;
notify pgrst, 'reload schema';
