-- P0 stock integrity: exact balance reads, API-safe view privileges, and
-- transaction-level lot locks for every operation that can reduce a balance.

create or replace view public.bm_stock_lot_location_balances
with (security_invoker = true)
as
select
  lot_id,
  location_id,
  coalesce(sum(quantity), 0)::numeric as on_hand
from public.bm_stock_movement_lines
group by lot_id, location_id;

revoke all on table public.bm_stock_lot_location_balances from public, anon, authenticated;
grant select on table public.bm_stock_lot_location_balances to service_role;

create or replace function public.move_bm_stock(
  p_lot uuid,
  p_from_location uuid,
  p_to_location uuid,
  p_quantity numeric,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lot public.bm_stock_lots;
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Move quantity must be greater than zero'; end if;
  if p_from_location = p_to_location then raise exception 'Move locations must be different'; end if;

  -- Serialize every balance-changing operation for this lot.
  select * into v_lot from public.bm_stock_lots where id = p_lot for update;
  if not found then raise exception 'BM stock lot not found'; end if;
  if not exists (select 1 from public.bm_stock_locations where id = p_from_location and is_active) then raise exception 'Active source location not found'; end if;
  if not exists (select 1 from public.bm_stock_locations where id = p_to_location and is_active) then raise exception 'Active destination location not found'; end if;
  if public.bm_lot_location_balance(p_lot, p_from_location) < p_quantity then raise exception 'Insufficient stock balance at source location'; end if;

  insert into public.bm_stock_transactions(transaction_type, reference_text, note, created_by)
  values ('move', nullif(trim(coalesce(p_reference_text, '')), ''), nullif(trim(coalesce(p_note, '')), ''), p_actor)
  returning id into v_transaction;

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  values
    (v_transaction, p_lot, p_from_location, -p_quantity),
    (v_transaction, p_lot, p_to_location, p_quantity);

  return v_transaction;
end;
$$;

create or replace function public.adjust_bm_stock(
  p_lot uuid,
  p_location uuid,
  p_quantity numeric,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_lot public.bm_stock_lots;
  v_transaction uuid;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role <> 'Admin' then raise exception 'Admin permission required for stock adjustment'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Adjustment quantity must not be zero'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Adjustment reason is required'; end if;

  select * into v_lot from public.bm_stock_lots where id = p_lot for update;
  if not found then raise exception 'BM stock lot not found'; end if;
  if not exists (select 1 from public.bm_stock_locations where id = p_location and is_active) then raise exception 'Active BM stock location not found'; end if;
  if public.bm_lot_location_balance(p_lot, p_location) + p_quantity < 0 then raise exception 'Stock balance cannot be negative'; end if;

  insert into public.bm_stock_transactions(transaction_type, reference_text, note, created_by)
  values ('adjustment', nullif(trim(coalesce(p_reference_text, '')), ''), trim(p_note), p_actor)
  returning id into v_transaction;

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  values (v_transaction, p_lot, p_location, p_quantity);

  return v_transaction;
end;
$$;

create or replace function public.reverse_bm_stock_transaction(
  p_transaction uuid,
  p_reason text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_source public.bm_stock_transactions;
  v_line public.bm_stock_movement_lines;
  v_transaction uuid;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role <> 'Admin' then raise exception 'Admin permission required for stock reversal'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Reversal reason is required'; end if;

  select * into v_source from public.bm_stock_transactions where id = p_transaction for update;
  if not found then raise exception 'BM stock transaction not found'; end if;
  if v_source.transaction_type = 'reversal' then raise exception 'Reversal transactions cannot be reversed'; end if;
  if exists (select 1 from public.bm_stock_transactions where source_transaction_id = v_source.id) then
    raise exception 'BM stock transaction is already reversed';
  end if;

  -- Lock lots in a deterministic order before re-checking balances.
  perform 1
  from public.bm_stock_lots
  where id in (select distinct lot_id from public.bm_stock_movement_lines where transaction_id = v_source.id)
  order by id
  for update;

  for v_line in select * from public.bm_stock_movement_lines where transaction_id = v_source.id loop
    if public.bm_lot_location_balance(v_line.lot_id, v_line.location_id) - v_line.quantity < 0 then
      raise exception 'Stock balance cannot be negative after reversal';
    end if;
  end loop;

  insert into public.bm_stock_transactions(transaction_type, note, source_transaction_id, created_by)
  values ('reversal', trim(p_reason), v_source.id, p_actor)
  returning id into v_transaction;

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  select v_transaction, lot_id, location_id, -quantity
  from public.bm_stock_movement_lines
  where transaction_id = v_source.id;

  return v_transaction;
end;
$$;

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

  -- Acquire all locks in UUID order before checking any balance to avoid races and deadlocks.
  for v_line in
    select distinct lot_id
    from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
    where lot_id is not null
    order by lot_id
  loop
    perform 1 from public.bm_stock_lots where id = v_line.lot_id for update;
    if not found then raise exception 'BM stock lot not found'; end if;
  end loop;

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

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
    group by lot_id, location_id
    having sum(quantity) > public.bm_lot_location_balance(lot_id, location_id)
  ) then
    raise exception 'Insufficient stock balance at selected location';
  end if;

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

revoke all on function public.move_bm_stock(uuid, uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.move_bm_stock(uuid, uuid, uuid, numeric, text, text, uuid) to service_role;
revoke all on function public.adjust_bm_stock(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_bm_stock(uuid, uuid, numeric, text, text, uuid) to service_role;
revoke all on function public.reverse_bm_stock_transaction(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reverse_bm_stock_transaction(uuid, text, uuid) to service_role;
revoke all on function public.issue_bm_stock_bundle(jsonb, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.issue_bm_stock_bundle(jsonb, text, text, text, text, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
