-- HPV kit distribution bundles: one HPV distribution can deduct multiple stock
-- items/lots in the same stock transaction.

alter table public.bm_hpv_kit_distributions
  add column if not exists kit_type text
  check (kit_type is null or kit_type in ('self_collected', 'clinician_collected'));

create table if not exists public.bm_hpv_kit_distribution_lines (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.bm_hpv_kit_distributions(id) on delete cascade,
  stock_lot_id uuid not null references public.bm_stock_lots(id),
  stock_location_id uuid not null references public.bm_stock_locations(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (distribution_id, stock_lot_id, stock_location_id)
);

create index if not exists bm_hpv_kit_distribution_lines_distribution
  on public.bm_hpv_kit_distribution_lines(distribution_id);

insert into public.bm_hpv_kit_distribution_lines(distribution_id, stock_lot_id, stock_location_id, quantity)
select id, stock_lot_id, stock_location_id, quantity
from public.bm_hpv_kit_distributions dist
where not exists (
  select 1
  from public.bm_hpv_kit_distribution_lines line
  where line.distribution_id = dist.id
);

alter table public.bm_hpv_kit_distribution_lines enable row level security;

drop policy if exists bm_hpv_kit_distribution_lines_active_read on public.bm_hpv_kit_distribution_lines;
create policy bm_hpv_kit_distribution_lines_active_read on public.bm_hpv_kit_distribution_lines
for select using (public.current_bm_role() is not null);

create or replace function public.issue_bm_stock_bundle(
  p_lines jsonb,
  p_purpose_text text,
  p_reference_text text,
  p_note text,
  p_override_reason text,
  p_expired_confirmed boolean,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_line record;
  v_lot public.bm_stock_lots;
  v_item public.bm_stock_items;
  v_location public.bm_stock_locations;
  v_recommended_lot uuid;
  v_recommended_location uuid;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Issue bundle lines are required';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
  loop
    if v_line.lot_id is null or v_line.location_id is null then
      raise exception 'Issue bundle line lot and location are required';
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Issue quantity must be greater than zero';
    end if;

    select * into v_lot from public.bm_stock_lots where id = v_line.lot_id for update;
    if not found then raise exception 'BM stock lot not found'; end if;
    select * into v_item from public.bm_stock_items where id = v_lot.item_id;
    if not found or not v_item.is_active then raise exception 'Active BM stock item not found'; end if;
    select * into v_location from public.bm_stock_locations where id = v_line.location_id and is_active;
    if not found then raise exception 'Active BM stock location not found'; end if;

    if public.bm_lot_location_balance(v_line.lot_id, v_line.location_id) < v_line.quantity then
      raise exception 'Insufficient stock balance at selected location';
    end if;
    if v_item.track_expiry and v_lot.expiry_date < v_today and not coalesce(p_expired_confirmed, false) then
      raise exception 'Confirm expired lot before issuing stock';
    end if;

    select lot.id, movement.location_id into v_recommended_lot, v_recommended_location
    from public.bm_stock_lots lot
    join public.bm_stock_movement_lines movement on movement.lot_id = lot.id
    where lot.item_id = v_item.id
      and (lot.expiry_date is null or lot.expiry_date >= v_today)
    group by lot.id, movement.location_id, lot.expiry_date, lot.created_at
    having coalesce(sum(movement.quantity), 0) > 0
    order by lot.expiry_date asc nulls last, lot.created_at, lot.id, movement.location_id
    limit 1;

    if v_recommended_lot is not null
      and (v_recommended_lot <> v_line.lot_id or v_recommended_location <> v_line.location_id)
      and nullif(trim(coalesce(p_override_reason, '')), '') is null
    then
      raise exception 'Override reason is required when not using the suggested FEFO lot/location';
    end if;
  end loop;

  insert into public.bm_stock_transactions(
    transaction_type, purpose_text, reference_text, note, override_reason, expired_confirmed, created_by
  )
  values (
    'issue', nullif(trim(coalesce(p_purpose_text, '')), ''), nullif(trim(coalesce(p_reference_text, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_override_reason, '')), ''),
    coalesce(p_expired_confirmed, false), p_actor
  )
  returning id into v_transaction;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
  loop
    insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
    values (v_transaction, v_line.lot_id, v_line.location_id, -v_line.quantity);
  end loop;

  return v_transaction;
end;
$$;

revoke all on function public.issue_bm_stock_bundle(jsonb, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.issue_bm_stock_bundle(jsonb, text, text, text, text, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
