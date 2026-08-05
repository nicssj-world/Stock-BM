-- Link reagent/consumable stock items to one or more preferred storage locations.
-- Used to default the location picker on receive/issue for that item.

create table public.bm_stock_item_location_links (
  stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade,
  location_id uuid not null references public.bm_stock_locations(id) on delete cascade,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  primary key (stock_item_id, location_id)
);

create index bm_stock_item_location_links_location
  on public.bm_stock_item_location_links(location_id);

alter table public.bm_stock_item_location_links enable row level security;

create policy bm_stock_item_location_links_read
  on public.bm_stock_item_location_links
  for select to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_stock_item_location_links to authenticated;
grant select, insert, update, delete on public.bm_stock_item_location_links to service_role;
