-- Per-equipment technician/vendor contacts used to prefill the public QR form.
-- Public users never query this table directly; the token route returns only
-- contacts belonging to the scanned equipment.
create table public.bm_equipment_technicians (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  technician_name text not null check (nullif(trim(technician_name), '') is not null),
  company text,
  phone text,
  created_by uuid not null references public.nipt_users(id),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bm_equipment_technicians_unique
  on public.bm_equipment_technicians (
    equipment_id,
    lower(technician_name),
    lower(coalesce(company, '')),
    lower(coalesce(phone, ''))
  );
create index bm_equipment_technicians_equipment
  on public.bm_equipment_technicians(equipment_id, technician_name);

alter table public.bm_equipment_technicians enable row level security;

create policy bm_equipment_technicians_active_read
  on public.bm_equipment_technicians
  for select
  to authenticated
  using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_equipment_technicians to authenticated;
grant select, insert, update, delete on public.bm_equipment_technicians to service_role;
