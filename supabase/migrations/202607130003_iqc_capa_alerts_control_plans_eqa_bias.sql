-- IQC operational workflow: CAPA ownership/effectiveness, assay-level control
-- plans, and traceable EQA bias inputs for Six Sigma.

alter table public.iqc_corrective_actions
  add column if not exists owner_id uuid references public.nipt_users(id),
  add column if not exists due_date date,
  add column if not exists effectiveness_outcome text not null default 'pending',
  add column if not exists effectiveness_note text,
  add column if not exists effectiveness_verified_by uuid references public.nipt_users(id),
  add column if not exists effectiveness_verified_at timestamptz;

alter table public.iqc_corrective_actions
  drop constraint if exists iqc_corrective_actions_status_check;
alter table public.iqc_corrective_actions
  add constraint iqc_corrective_actions_status_check
    check (status in ('open', 'awaiting-effectiveness', 'closed')),
  add constraint iqc_corrective_actions_effectiveness_outcome_check
    check (effectiveness_outcome in ('pending', 'effective', 'ineffective'));

create index if not exists iqc_corrective_actions_due_open
  on public.iqc_corrective_actions(due_date)
  where status <> 'closed';

create table public.iqc_control_plans (
  id uuid primary key default gen_random_uuid(),
  analyte_id uuid not null references public.iqc_analytes(id) on delete cascade,
  instrument_id uuid not null references public.iqc_instruments(id) on delete cascade,
  required_levels text[] not null check (cardinality(required_levels) > 0),
  frequency text not null default 'daily' check (frequency in ('daily', 'per-run')),
  westgard_rules text[] not null default array['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'],
  is_active boolean not null default true,
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analyte_id, instrument_id)
);

create index iqc_control_plans_active on public.iqc_control_plans(instrument_id, analyte_id) where is_active;
alter table public.iqc_control_plans enable row level security;
create policy iqc_control_plans_read on public.iqc_control_plans for select using (public.current_bm_role() is not null);

alter table public.eqa_results
  add column if not exists iqc_analyte_id uuid references public.iqc_analytes(id),
  add column if not exists assigned_value numeric;
create index if not exists eqa_results_iqc_analyte on public.eqa_results(iqc_analyte_id);
