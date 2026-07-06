-- Allow BM stock issue transactions without a purpose/reason.

create or replace function public.issue_bm_stock(
  p_lot uuid,
  p_location uuid,
  p_quantity numeric,
  p_purpose_text text,
  p_reference_text text,
  p_note text,
  p_override_reason text,
  p_expired_confirmed boolean,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lot public.bm_stock_lots;
  v_item public.bm_stock_items;
  v_location public.bm_stock_locations;
  v_recommended_lot uuid;
  v_recommended_location uuid;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Issue quantity must be greater than zero'; end if;

  select * into v_lot from public.bm_stock_lots where id = p_lot for update;
  if not found then raise exception 'BM stock lot not found'; end if;
  select * into v_item from public.bm_stock_items where id = v_lot.item_id;
  if not found or not v_item.is_active then raise exception 'Active BM stock item not found'; end if;
  select * into v_location from public.bm_stock_locations where id = p_location and is_active;
  if not found then raise exception 'Active BM stock location not found'; end if;

  if public.bm_lot_location_balance(p_lot, p_location) < p_quantity then raise exception 'Insufficient stock balance at selected location'; end if;
  if v_item.track_expiry and v_lot.expiry_date < v_today and not coalesce(p_expired_confirmed, false) then
    raise exception 'Confirm expired lot before issuing stock';
  end if;

  select lot.id, line.location_id into v_recommended_lot, v_recommended_location
  from public.bm_stock_lots lot
  join public.bm_stock_movement_lines line on line.lot_id = lot.id
  where lot.item_id = v_item.id
    and (lot.expiry_date is null or lot.expiry_date >= v_today)
  group by lot.id, line.location_id, lot.expiry_date, lot.created_at
  having coalesce(sum(line.quantity), 0) > 0
  order by lot.expiry_date asc nulls last, lot.created_at, lot.id, line.location_id
  limit 1;

  if v_recommended_lot is not null
    and (v_recommended_lot <> p_lot or v_recommended_location <> p_location)
    and nullif(trim(coalesce(p_override_reason, '')), '') is null
  then
    raise exception 'Override reason is required when not using the suggested FEFO lot/location';
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

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  values (v_transaction, p_lot, p_location, -p_quantity);

  return v_transaction;
end;
$$;

revoke all on function public.issue_bm_stock(uuid, uuid, numeric, text, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.issue_bm_stock(uuid, uuid, numeric, text, text, text, text, boolean, uuid) to service_role;
