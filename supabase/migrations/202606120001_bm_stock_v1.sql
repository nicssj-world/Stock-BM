-- BM Stock: molecular biology reagent and consumable stock ledger.
-- Run in the same Supabase project as Genomic-CBH after the nipt_users table exists.

create table public.bm_user_access (
  user_id uuid primary key references public.nipt_users(id) on delete cascade,
  role text not null check (role in ('Admin', 'Staff')),
  is_active boolean not null default true,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bm_stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (nullif(trim(name), '') is not null),
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bm_stock_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  storage_condition text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bm_stock_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique check (nullif(trim(item_code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  category_id uuid not null references public.bm_stock_categories(id),
  unit text not null check (nullif(trim(unit), '') is not null),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  expiry_warning_days integer not null default 90 check (expiry_warning_days >= 0),
  storage_condition text,
  supplier text,
  catalog_no text,
  manufacturer text,
  manufacturer_barcode text,
  track_lot boolean not null default true,
  track_expiry boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not track_expiry or track_lot)
);

create unique index bm_stock_items_manufacturer_barcode_unique
on public.bm_stock_items(manufacturer_barcode)
where manufacturer_barcode is not null;

create table public.bm_stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.bm_stock_items(id),
  lot_number text not null check (nullif(trim(lot_number), '') is not null),
  expiry_date date,
  internal_qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  manufacturer_barcode text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (item_id, lot_number)
);

create unique index bm_stock_lots_manufacturer_barcode_unique
on public.bm_stock_lots(manufacturer_barcode)
where manufacturer_barcode is not null;

create table public.bm_stock_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('receive', 'issue', 'move', 'adjustment', 'reversal')),
  reference_text text,
  purpose_text text,
  note text,
  override_reason text,
  expired_confirmed boolean not null default false,
  source_transaction_id uuid unique references public.bm_stock_transactions(id),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'reversal' and source_transaction_id is not null)
    or (transaction_type <> 'reversal' and source_transaction_id is null)
  )
);

create table public.bm_stock_movement_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.bm_stock_transactions(id),
  lot_id uuid not null references public.bm_stock_lots(id),
  location_id uuid not null references public.bm_stock_locations(id),
  quantity numeric(14, 3) not null check (quantity <> 0),
  created_at timestamptz not null default now()
);

create table public.bm_audit_logs (
  id bigserial primary key,
  actor_id uuid references public.nipt_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bm_user_access_role on public.bm_user_access(role);
create index bm_stock_items_category_id on public.bm_stock_items(category_id);
create index bm_stock_lots_item_id on public.bm_stock_lots(item_id);
create index bm_stock_transactions_created_at on public.bm_stock_transactions(created_at desc);
create index bm_stock_movement_lines_lot_location on public.bm_stock_movement_lines(lot_id, location_id);
create index bm_stock_movement_lines_transaction_id on public.bm_stock_movement_lines(transaction_id);
create index bm_audit_logs_created_at on public.bm_audit_logs(created_at desc);

create or replace function public.current_bm_role()
returns text language sql stable security definer set search_path = public as $$
  select access.role
  from public.bm_user_access access
  join public.nipt_users users on users.id = access.user_id
  where access.user_id = auth.uid()
    and access.is_active
    and users.is_active;
$$;

create or replace function public.assert_bm_stock_actor(p_actor uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  select access.role into v_role
  from public.bm_user_access access
  join public.nipt_users users on users.id = access.user_id
  where access.user_id = p_actor
    and access.is_active
    and users.is_active;

  if v_role is null then raise exception 'Active BM stock actor is required'; end if;
  return v_role;
end;
$$;

create or replace function public.bm_lot_location_balance(p_lot uuid, p_location uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::numeric
  from public.bm_stock_movement_lines
  where lot_id = p_lot and location_id = p_location;
$$;

create or replace function public.bm_lot_total_balance(p_lot uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::numeric
  from public.bm_stock_movement_lines
  where lot_id = p_lot;
$$;

create or replace function public.receive_bm_stock(
  p_item uuid,
  p_lot_number text,
  p_expiry_date date,
  p_quantity numeric,
  p_location uuid,
  p_supplier_text text,
  p_reference_text text,
  p_note text,
  p_manufacturer_barcode text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_item public.bm_stock_items;
  v_location public.bm_stock_locations;
  v_lot public.bm_stock_lots;
  v_lot_number text := trim(coalesce(p_lot_number, ''));
  v_expiry_date date := p_expiry_date;
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Receive quantity must be greater than zero'; end if;

  select * into v_item from public.bm_stock_items where id = p_item and is_active for update;
  if not found then raise exception 'Active BM stock item not found'; end if;

  select * into v_location from public.bm_stock_locations where id = p_location and is_active;
  if not found then raise exception 'Active BM stock location not found'; end if;

  if v_item.track_lot then
    if v_lot_number = '' then raise exception 'Lot number is required for this item'; end if;
  else
    v_lot_number := 'NO-LOT';
    v_expiry_date := null;
  end if;

  if v_item.track_expiry and v_expiry_date is null then raise exception 'Expiry date is required for this item'; end if;
  if not v_item.track_expiry then v_expiry_date := null; end if;

  select * into v_lot
  from public.bm_stock_lots
  where item_id = p_item and lot_number = v_lot_number
  for update;

  if found then
    if v_lot.expiry_date is distinct from v_expiry_date then
      raise exception 'Existing lot expiry date does not match';
    end if;
    if nullif(trim(coalesce(p_manufacturer_barcode, '')), '') is not null and v_lot.manufacturer_barcode is null then
      update public.bm_stock_lots
      set manufacturer_barcode = trim(p_manufacturer_barcode)
      where id = v_lot.id
      returning * into v_lot;
    end if;
  else
    insert into public.bm_stock_lots(item_id, lot_number, expiry_date, manufacturer_barcode, created_by)
    values (p_item, v_lot_number, v_expiry_date, nullif(trim(coalesce(p_manufacturer_barcode, '')), ''), p_actor)
    returning * into v_lot;
  end if;

  insert into public.bm_stock_transactions(
    transaction_type, reference_text, note, created_by
  )
  values (
    'receive', nullif(trim(coalesce(p_reference_text, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), p_actor
  )
  returning id into v_transaction;

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  values (v_transaction, v_lot.id, p_location, p_quantity);

  return v_transaction;
end;
$$;

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
  if nullif(trim(coalesce(p_purpose_text, '')), '') is null then raise exception 'Issue purpose is required'; end if;

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
    'issue', trim(p_purpose_text), nullif(trim(coalesce(p_reference_text, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_override_reason, '')), ''),
    coalesce(p_expired_confirmed, false), p_actor
  )
  returning id into v_transaction;

  insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
  values (v_transaction, p_lot, p_location, -p_quantity);

  return v_transaction;
end;
$$;

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
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Move quantity must be greater than zero'; end if;
  if p_from_location = p_to_location then raise exception 'Move locations must be different'; end if;
  if not exists (select 1 from public.bm_stock_lots where id = p_lot) then raise exception 'BM stock lot not found'; end if;
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
  v_transaction uuid;
begin
  v_role := public.assert_bm_stock_actor(p_actor);
  if v_role <> 'Admin' then raise exception 'Admin permission required for stock adjustment'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Adjustment quantity must not be zero'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'Adjustment reason is required'; end if;
  if not exists (select 1 from public.bm_stock_lots where id = p_lot) then raise exception 'BM stock lot not found'; end if;
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

create or replace function public.prevent_bm_stock_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'BM stock ledger is append-only; create a reversal instead';
end;
$$;

create trigger bm_stock_transactions_append_only
before update or delete on public.bm_stock_transactions
for each row execute function public.prevent_bm_stock_ledger_mutation();

create trigger bm_stock_movement_lines_append_only
before update or delete on public.bm_stock_movement_lines
for each row execute function public.prevent_bm_stock_ledger_mutation();

alter table public.bm_user_access enable row level security;
alter table public.bm_stock_categories enable row level security;
alter table public.bm_stock_locations enable row level security;
alter table public.bm_stock_items enable row level security;
alter table public.bm_stock_lots enable row level security;
alter table public.bm_stock_transactions enable row level security;
alter table public.bm_stock_movement_lines enable row level security;
alter table public.bm_audit_logs enable row level security;

create policy bm_user_access_self_read on public.bm_user_access
for select using (user_id = auth.uid() or public.current_bm_role() = 'Admin');

create policy bm_stock_categories_active_read on public.bm_stock_categories
for select using (public.current_bm_role() is not null);

create policy bm_stock_locations_active_read on public.bm_stock_locations
for select using (public.current_bm_role() is not null);

create policy bm_stock_items_active_read on public.bm_stock_items
for select using (public.current_bm_role() is not null);

create policy bm_stock_lots_active_read on public.bm_stock_lots
for select using (public.current_bm_role() is not null);

create policy bm_stock_transactions_active_read on public.bm_stock_transactions
for select using (public.current_bm_role() is not null);

create policy bm_stock_movement_lines_active_read on public.bm_stock_movement_lines
for select using (public.current_bm_role() is not null);

create policy bm_audit_logs_active_read on public.bm_audit_logs
for select using (public.current_bm_role() is not null);

revoke all on function public.assert_bm_stock_actor(uuid) from public, anon, authenticated;
revoke all on function public.bm_lot_location_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bm_lot_total_balance(uuid) from public, anon, authenticated;
revoke all on function public.receive_bm_stock(uuid, text, date, numeric, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.issue_bm_stock(uuid, uuid, numeric, text, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.move_bm_stock(uuid, uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.adjust_bm_stock(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reverse_bm_stock_transaction(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.assert_bm_stock_actor(uuid) to service_role;
grant execute on function public.bm_lot_location_balance(uuid, uuid) to service_role;
grant execute on function public.bm_lot_total_balance(uuid) to service_role;
grant execute on function public.receive_bm_stock(uuid, text, date, numeric, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.issue_bm_stock(uuid, uuid, numeric, text, text, text, text, boolean, uuid) to service_role;
grant execute on function public.move_bm_stock(uuid, uuid, uuid, numeric, text, text, uuid) to service_role;
grant execute on function public.adjust_bm_stock(uuid, uuid, numeric, text, text, uuid) to service_role;
grant execute on function public.reverse_bm_stock_transaction(uuid, text, uuid) to service_role;
