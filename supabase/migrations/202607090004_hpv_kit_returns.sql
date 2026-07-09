-- HPV kit returns from sites back into the original stock lot/location.

create table if not exists public.bm_hpv_kit_returns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.bm_hpv_sites(id),
  returned_on date not null default ((now() at time zone 'Asia/Bangkok')::date),
  stock_transaction_id uuid not null unique references public.bm_stock_transactions(id),
  note text,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.bm_hpv_kit_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.bm_hpv_kit_returns(id) on delete cascade,
  distribution_id uuid not null references public.bm_hpv_kit_distributions(id),
  distribution_line_id uuid references public.bm_hpv_kit_distribution_lines(id),
  stock_lot_id uuid not null references public.bm_stock_lots(id),
  stock_location_id uuid not null references public.bm_stock_locations(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists bm_hpv_kit_returns_site_date
  on public.bm_hpv_kit_returns(site_id, returned_on desc);

create index if not exists bm_hpv_kit_return_lines_return
  on public.bm_hpv_kit_return_lines(return_id);

create index if not exists bm_hpv_kit_return_lines_distribution_line
  on public.bm_hpv_kit_return_lines(distribution_line_id);

alter table public.bm_hpv_kit_returns enable row level security;
alter table public.bm_hpv_kit_return_lines enable row level security;

drop policy if exists bm_hpv_kit_returns_active_read on public.bm_hpv_kit_returns;
create policy bm_hpv_kit_returns_active_read on public.bm_hpv_kit_returns
for select using (public.current_bm_role() is not null);

drop policy if exists bm_hpv_kit_return_lines_active_read on public.bm_hpv_kit_return_lines;
create policy bm_hpv_kit_return_lines_active_read on public.bm_hpv_kit_return_lines
for select using (public.current_bm_role() is not null);

create or replace function public.receive_bm_stock_bundle(
  p_lines jsonb,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_line record;
  v_lot public.bm_stock_lots;
  v_location public.bm_stock_locations;
  v_transaction uuid;
begin
  perform public.assert_bm_stock_actor(p_actor);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Receive bundle lines are required';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
  loop
    if v_line.lot_id is null or v_line.location_id is null then
      raise exception 'Receive bundle line lot and location are required';
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Receive quantity must be greater than zero';
    end if;

    select * into v_lot from public.bm_stock_lots where id = v_line.lot_id for update;
    if not found then raise exception 'BM stock lot not found'; end if;
    select * into v_location from public.bm_stock_locations where id = v_line.location_id and is_active;
    if not found then raise exception 'Active BM stock location not found'; end if;
  end loop;

  insert into public.bm_stock_transactions(transaction_type, reference_text, note, created_by)
  values (
    'receive',
    nullif(trim(coalesce(p_reference_text, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    p_actor
  )
  returning id into v_transaction;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)
  loop
    insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)
    values (v_transaction, v_line.lot_id, v_line.location_id, v_line.quantity);
  end loop;

  return v_transaction;
end;
$$;

revoke all on function public.receive_bm_stock_bundle(jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.receive_bm_stock_bundle(jsonb, text, text, uuid) to service_role;

create or replace function public.return_hpv_kit_bundle(
  p_site_id uuid,
  p_returned_on date,
  p_lines jsonb,
  p_reference_text text,
  p_note text,
  p_actor uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_return uuid;
  v_transaction uuid;
  v_line record;
begin
  perform public.assert_bm_stock_actor(p_actor);

  v_transaction := public.receive_bm_stock_bundle(
    p_lines,
    p_reference_text,
    p_note,
    p_actor
  );

  insert into public.bm_hpv_kit_returns(site_id, returned_on, stock_transaction_id, note, created_by)
  values (p_site_id, coalesce(p_returned_on, (now() at time zone 'Asia/Bangkok')::date), v_transaction, nullif(trim(coalesce(p_note, '')), ''), p_actor)
  returning id into v_return;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(
      distribution_id uuid,
      distribution_line_id uuid,
      lot_id uuid,
      location_id uuid,
      quantity numeric
    )
  loop
    insert into public.bm_hpv_kit_return_lines(
      return_id, distribution_id, distribution_line_id, stock_lot_id, stock_location_id, quantity
    )
    values (
      v_return,
      v_line.distribution_id,
      v_line.distribution_line_id,
      v_line.lot_id,
      v_line.location_id,
      v_line.quantity::integer
    );
  end loop;

  return v_return;
end;
$$;

revoke all on function public.return_hpv_kit_bundle(uuid, date, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.return_hpv_kit_bundle(uuid, date, jsonb, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
