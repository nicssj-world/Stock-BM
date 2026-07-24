-- Link reagent/consumable stock items to one or more registered instruments.
-- A separate relation table keeps the stock item reusable across multiple tools.

create table public.bm_stock_item_equipment_links (
  stock_item_id uuid not null references public.bm_stock_items(id) on delete cascade,
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  primary key (stock_item_id, equipment_id)
);

create index bm_stock_item_equipment_links_equipment
  on public.bm_stock_item_equipment_links(equipment_id);

alter table public.bm_stock_item_equipment_links enable row level security;

create policy bm_stock_item_equipment_links_read
  on public.bm_stock_item_equipment_links
  for select to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_stock_item_equipment_links to authenticated;
grant select, insert, update, delete on public.bm_stock_item_equipment_links to service_role;
