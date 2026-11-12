-- Equipment remains mastered in Lab Management Portal. These tables hold only
-- read-only reference snapshots and module associations. The archived
-- bm_equipment and bm_equipment_module_links tables are never modified.
create table if not exists public.bm_portal_equipment_refs (
  portal_equipment_id uuid primary key,
  lab_code text not null unique,
  name text not null,
  model text,
  serial_number text,
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
  (portal_equipment_id, lab_code, name, model, serial_number, status)
select portal_equipment_id, code, name, model, serial_number, status
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


-- Transactional replacement. Validates the module, owning entity and every
-- Portal reference before changing any associations.
create or replace function public.replace_bm_portal_equipment_links(
  p_module text, p_entity_id uuid, p_equipment_ids uuid[], p_actor uuid
) returns void language plpgsql security invoker set search_path = public as $
declare v_count integer;
begin
  if p_module not in ('iqc','eqa','stock') or p_entity_id is null then
    raise exception 'Invalid equipment module or entity';
  end if;
  if p_module = 'iqc' and coalesce(array_length(p_equipment_ids,1),0) > 1 then
    raise exception 'One IQC instrument can link only one equipment';
  end if;
  if p_module = 'iqc' then
    perform 1 from public.iqc_instruments where id = p_entity_id;
  elsif p_module = 'eqa' then
    perform 1 from public.eqa_schemes where id = p_entity_id;
  else
    perform 1 from public.bm_stock_items where id = p_entity_id;
  end if;
  if not found then raise exception 'Target module entity does not exist'; end if;
  select count(*) into v_count
  from (select distinct x from unnest(coalesce(p_equipment_ids,'{}'::uuid[])) as x) ids
  left join public.bm_portal_equipment_refs refs on refs.portal_equipment_id = ids.x
  where ids.x is null or refs.portal_equipment_id is null or refs.status = 'decommissioned';
  if v_count > 0 then raise exception 'Portal equipment is unknown or decommissioned'; end if;
  delete from public.bm_portal_equipment_links
  where module = p_module and entity_id = p_entity_id;
  insert into public.bm_portal_equipment_links(module,entity_id,portal_equipment_id,created_by)
  select p_module,p_entity_id,x,p_actor
  from (select distinct x from unnest(coalesce(p_equipment_ids,'{}'::uuid[])) as x) ids;
end;
$;
revoke all on function public.replace_bm_portal_equipment_links(text,uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.replace_bm_portal_equipment_links(text,uuid,uuid[],uuid) to service_role;

-- The historical VL baseline approval RPC also checks an archived equipment
-- link. Patch only that existence guard, preserving every other calculation,
-- signature and version of the function currently installed.
do $portal_iqc_baseline_guard$
declare
  v_original text;
  v_updated text;
begin
  select pg_get_functiondef(p.oid) into v_original
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'apply_iqc_vl_baseline' and p.prokind = 'f'
  limit 1;
  if v_original is not null then
    v_updated := regexp_replace(v_original,
      'from public[.]bm_equipment_module_links link[[:space:]]+join public[.]bm_equipment equipment on equipment[.]id = link[.]equipment_id[[:space:]]+where link[.]module = ''iqc''[[:space:]]+and link[.]entity_type = ''instrument''[[:space:]]+and link[.]entity_id = p_instrument_id[[:space:]]+and equipment[.]status <> ''decommissioned''',
      'from public.bm_portal_equipment_links link join public.bm_portal_equipment_refs equipment on equipment.portal_equipment_id = link.portal_equipment_id where link.module = ''iqc'' and link.entity_id = p_instrument_id and equipment.status <> ''decommissioned''',
      'i');
    if v_updated = v_original then
      raise exception 'VL baseline guard changed; migration requires manual review';
    end if;
    execute v_updated;
  end if;
end;
$portal_iqc_baseline_guard$;

notify pgrst, 'reload schema';
