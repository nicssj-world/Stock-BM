-- Equipment remains mastered in Lab Management Portal. These tables hold only
-- read-only reference snapshots and module associations. The archived
-- bm_equipment and bm_equipment_module_links tables are never modified.
create table if not exists public.bm_portal_equipment_refs (
  portal_equipment_id uuid primary key,
  lab_code text not null unique,
  name text not null,
  model text,
  status text not null default 'active'
    check (status in ('active','maintenance','out_of_service','decommissioned')),
  portal_url text,
  synced_at timestamptz not null default now()
);
create index if not exists bm_portal_equipment_refs_code_idx
  on public.bm_portal_equipment_refs (lower(lab_code));

create table if not exists public.bm_portal_equipment_links (
  module text not null check (module in ('iqc','eqa','stock')),
  entity_id uuid not null,
  portal_equipment_id uuid not null
    references public.bm_portal_equipment_refs(portal_equipment_id) on delete restrict,
  created_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  primary key (module, entity_id, portal_equipment_id)
);
create unique index if not exists bm_portal_iqc_one_equipment
  on public.bm_portal_equipment_links(entity_id) where module = 'iqc';
create index if not exists bm_portal_equipment_links_equipment
  on public.bm_portal_equipment_links(portal_equipment_id);

alter table public.bm_portal_equipment_refs enable row level security;
alter table public.bm_portal_equipment_links enable row level security;
revoke all on public.bm_portal_equipment_refs from public, anon, authenticated;
revoke all on public.bm_portal_equipment_links from public, anon, authenticated;
grant select, insert, update, delete on public.bm_portal_equipment_refs to service_role;
grant select, insert, update, delete on public.bm_portal_equipment_links to service_role;

-- Migrate associations by identity. Preserve all source rows for history.
insert into public.bm_portal_equipment_refs
  (portal_equipment_id, lab_code, name, model, status)
select portal_equipment_id, code, name, model, status
from public.bm_equipment
where portal_equipment_id is not null
on conflict (portal_equipment_id) do nothing;

insert into public.bm_portal_equipment_links
  (module, entity_id, portal_equipment_id)
select link.module, link.entity_id, equipment.portal_equipment_id
from public.bm_equipment_module_links link
join public.bm_equipment equipment on equipment.id = link.equipment_id
where equipment.portal_equipment_id is not null
on conflict do nothing;

insert into public.bm_portal_equipment_links
  (module, entity_id, portal_equipment_id)
select 'stock', link.stock_item_id, equipment.portal_equipment_id
from public.bm_stock_item_equipment_links link
join public.bm_equipment equipment on equipment.id = link.equipment_id
where equipment.portal_equipment_id is not null
on conflict do nothing;

notify pgrst, 'reload schema';
