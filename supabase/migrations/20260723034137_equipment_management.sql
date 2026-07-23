-- Equipment lifecycle management. Public QR submissions are handled only by
-- server-side routes using the service role; no table or bucket is public.

create table public.bm_equipment (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (nullif(trim(code), '') is not null),
  name text not null check (nullif(trim(name), '') is not null),
  category text,
  manufacturer text,
  model text,
  serial_number text,
  asset_number text,
  location text,
  installed_on date,
  warranty_until date,
  status text not null default 'active' check (status in ('active', 'maintenance', 'out_of_service', 'decommissioned')),
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  note text,
  created_by uuid not null references public.nipt_users(id),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bm_equipment_serial_unique on public.bm_equipment(lower(serial_number)) where serial_number is not null and trim(serial_number) <> '';
create unique index bm_equipment_asset_unique on public.bm_equipment(lower(asset_number)) where asset_number is not null and trim(asset_number) <> '';
create index bm_equipment_status on public.bm_equipment(status, code);

create table public.bm_equipment_plans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  activity_type text not null check (activity_type in ('pm', 'calibration', 'verification', 'qualification', 'inspection_safety')),
  title text not null check (nullif(trim(title), '') is not null),
  interval_value integer not null check (interval_value > 0),
  interval_unit text not null check (interval_unit in ('day', 'week', 'month', 'year')),
  schedule_basis text not null default 'completion_based' check (schedule_basis in ('completion_based', 'fixed_schedule')),
  next_due_on date not null,
  reminder_days integer not null default 30 check (reminder_days between 0 and 3650),
  last_completed_on date,
  vendor text,
  instruction text,
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  updated_by uuid references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bm_equipment_plans_due on public.bm_equipment_plans(next_due_on) where is_active;
create index bm_equipment_plans_equipment on public.bm_equipment_plans(equipment_id, is_active);

create table public.bm_equipment_service_records (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id),
  plan_id uuid references public.bm_equipment_plans(id) on delete set null,
  event_type text not null check (event_type in ('pm', 'repair', 'calibration', 'verification', 'qualification', 'inspection_safety', 'software_firmware', 'relocation', 'other')),
  other_event_label text,
  qualification_stage text check (qualification_stage is null or qualification_stage in ('IQ', 'OQ', 'PQ')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'voided')),
  source text not null default 'internal' check (source in ('internal', 'public_qr')),
  performed_on date not null,
  reported_problem text,
  findings text,
  action_taken text not null check (nullif(trim(action_taken), '') is not null),
  parts_replaced text,
  job_number text,
  company text,
  technician_name text not null check (nullif(trim(technician_name), '') is not null),
  technician_contact text,
  receiver_name text,
  downtime_from timestamptz,
  downtime_until timestamptz,
  outcome text not null default 'pass' check (outcome in ('pass', 'conditional', 'fail')),
  return_status text not null default 'active' check (return_status in ('active', 'maintenance', 'out_of_service')),
  next_recommended_on date,
  idempotency_key uuid,
  submitted_at timestamptz not null default now(),
  created_by uuid references public.nipt_users(id),
  reviewed_by uuid references public.nipt_users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  void_reason text,
  voided_by uuid references public.nipt_users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_type <> 'other' or nullif(trim(other_event_label), '') is not null),
  check (downtime_from is null or downtime_until is null or downtime_from <= downtime_until),
  check (source <> 'public_qr' or idempotency_key is not null)
);

create unique index bm_equipment_service_idempotency on public.bm_equipment_service_records(idempotency_key) where idempotency_key is not null;
create index bm_equipment_service_equipment_date on public.bm_equipment_service_records(equipment_id, performed_on desc);
create index bm_equipment_service_pending on public.bm_equipment_service_records(submitted_at) where status = 'pending';

create table public.bm_equipment_module_links (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.bm_equipment(id) on delete cascade,
  module text not null check (module in ('iqc', 'eqa')),
  entity_type text not null check ((module = 'iqc' and entity_type = 'instrument') or (module = 'eqa' and entity_type = 'scheme')),
  entity_id uuid not null,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  unique (equipment_id, module, entity_type, entity_id)
);

create unique index bm_equipment_iqc_instrument_unique on public.bm_equipment_module_links(entity_id) where module = 'iqc' and entity_type = 'instrument';
create index bm_equipment_module_links_entity on public.bm_equipment_module_links(module, entity_type, entity_id);

alter table public.bm_attachments drop constraint if exists bm_attachments_module_check;
alter table public.bm_attachments add constraint bm_attachments_module_check
  check (module in ('iqc', 'eqa', 'stock', 'env', 'lotverif', 'hpv', 'equipment'));
alter table public.bm_attachments alter column uploaded_by drop not null;
alter table public.bm_attachments add column if not exists uploader_name text;
alter table public.bm_attachments add column if not exists source text not null default 'internal' check (source in ('internal', 'public_qr'));
drop policy if exists bm_attachments_active_read on public.bm_attachments;
create policy bm_attachments_active_read on public.bm_attachments for select using (
  (module <> 'equipment' and public.current_bm_role() is not null)
  or (module = 'equipment' and public.current_bm_role() in ('Admin', 'Staff'))
);

alter table public.bm_equipment enable row level security;
alter table public.bm_equipment_plans enable row level security;
alter table public.bm_equipment_service_records enable row level security;
alter table public.bm_equipment_module_links enable row level security;

create policy bm_equipment_active_read on public.bm_equipment for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_plans_active_read on public.bm_equipment_plans for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_service_active_read on public.bm_equipment_service_records for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));
create policy bm_equipment_links_active_read on public.bm_equipment_module_links for select to authenticated using (public.current_bm_role() in ('Admin', 'Staff'));

grant select on public.bm_equipment, public.bm_equipment_plans, public.bm_equipment_service_records, public.bm_equipment_module_links to authenticated;
grant select, insert, update, delete on public.bm_equipment, public.bm_equipment_plans, public.bm_equipment_service_records, public.bm_equipment_module_links to service_role;

create or replace function public.add_equipment_interval(
  p_date date,
  p_value integer,
  p_unit text
) returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result date;
  v_is_month_end boolean;
begin
  if p_value < 1 or p_unit not in ('day', 'week', 'month', 'year') then
    raise exception 'Invalid equipment interval';
  end if;
  if p_unit = 'day' then return p_date + p_value; end if;
  if p_unit = 'week' then return p_date + (p_value * 7); end if;
  v_is_month_end := p_date = (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
  v_result := case p_unit
    when 'month' then (p_date + make_interval(months => p_value))::date
    else (p_date + make_interval(years => p_value))::date
  end;
  if v_is_month_end then
    v_result := (date_trunc('month', v_result) + interval '1 month - 1 day')::date;
  end if;
  return v_result;
end;
$$;

revoke all on function public.add_equipment_interval(date, integer, text) from public, anon, authenticated;
grant execute on function public.add_equipment_interval(date, integer, text) to service_role;

create or replace function public.approve_equipment_service_record(
  p_record_id uuid,
  p_reviewer uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.bm_equipment_service_records%rowtype;
  v_plan public.bm_equipment_plans%rowtype;
  v_next date;
begin
  select * into v_record from public.bm_equipment_service_records where id = p_record_id for update;
  if not found then raise exception 'Service record not found'; end if;
  if v_record.status <> 'pending' then raise exception 'Only pending records can be approved'; end if;

  update public.bm_equipment_service_records
     set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now(), updated_at = now()
   where id = p_record_id;

  update public.bm_equipment
     set status = v_record.return_status, updated_by = p_reviewer, updated_at = now()
   where id = v_record.equipment_id and status <> 'decommissioned';

  if v_record.plan_id is not null then
    select * into v_plan from public.bm_equipment_plans where id = v_record.plan_id for update;
    if found then
      if v_plan.equipment_id <> v_record.equipment_id then raise exception 'Plan does not belong to equipment'; end if;
      if v_plan.schedule_basis = 'completion_based' then
        v_next := public.add_equipment_interval(v_record.performed_on, v_plan.interval_value, v_plan.interval_unit);
      else
        v_next := v_plan.next_due_on;
        while v_next <= v_record.performed_on loop
          v_next := public.add_equipment_interval(v_next, v_plan.interval_value, v_plan.interval_unit);
        end loop;
      end if;
      update public.bm_equipment_plans
         set last_completed_on = v_record.performed_on, next_due_on = v_next,
             updated_by = p_reviewer, updated_at = now()
       where id = v_plan.id;
    end if;
  end if;
end;
$$;

revoke all on function public.approve_equipment_service_record(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_equipment_service_record(uuid, uuid) to service_role;
