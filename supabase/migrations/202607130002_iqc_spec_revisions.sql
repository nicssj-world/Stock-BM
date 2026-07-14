alter table public.iqc_control_specs
  add column updated_by uuid references public.nipt_users(id),
  add column change_reason text;

create table public.iqc_control_spec_revisions (
  id uuid primary key default gen_random_uuid(),
  control_lot_id uuid not null references public.iqc_control_lots(id),
  analyte_id uuid not null references public.iqc_analytes(id),
  assigned_mean numeric,
  assigned_sd numeric check (assigned_sd is null or assigned_sd >= 0),
  expected_qualitative text,
  change_reason text,
  changed_by uuid references public.nipt_users(id),
  changed_at timestamptz not null default now()
);

create index iqc_control_spec_revisions_lookup
  on public.iqc_control_spec_revisions (control_lot_id, analyte_id, changed_at desc);

alter table public.iqc_control_spec_revisions enable row level security;

create policy iqc_control_spec_revisions_read
  on public.iqc_control_spec_revisions for select
  using (public.current_bm_role() is not null);

create or replace function public.capture_iqc_control_spec_revision()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'insert'
    and new.assigned_mean is null
    and new.assigned_sd is null
    and new.expected_qualitative is null then
    return new;
  end if;

  if tg_op = 'insert'
    or new.assigned_mean is distinct from old.assigned_mean
    or new.assigned_sd is distinct from old.assigned_sd
    or new.expected_qualitative is distinct from old.expected_qualitative then
    insert into public.iqc_control_spec_revisions (
      control_lot_id,
      analyte_id,
      assigned_mean,
      assigned_sd,
      expected_qualitative,
      change_reason,
      changed_by
    ) values (
      new.control_lot_id,
      new.analyte_id,
      new.assigned_mean,
      new.assigned_sd,
      new.expected_qualitative,
      new.change_reason,
      coalesce(new.updated_by, new.created_by)
    );
  end if;
  return new;
end;
$$;

create trigger iqc_control_spec_revision_audit
after insert or update of assigned_mean, assigned_sd, expected_qualitative
on public.iqc_control_specs
for each row
execute function public.capture_iqc_control_spec_revision();
