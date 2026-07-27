-- EQA corrective actions gain ownership, a due date, and an optional
-- effectiveness-verification follow-up (borrowed from IQC), but unlike IQC
-- closing is never gated on that verification -- a CAPA can be closed in one
-- step, and effectiveness can be recorded any time after, with an
-- "ineffective" verdict reopening it. So the status stays two-valued.

alter table public.eqa_corrective_actions
  add column if not exists owner_id uuid references public.nipt_users(id),
  add column if not exists due_date date,
  add column if not exists effectiveness_outcome text not null default 'pending',
  add column if not exists effectiveness_note text,
  add column if not exists effectiveness_verified_by uuid references public.nipt_users(id),
  add column if not exists effectiveness_verified_at timestamptz;

alter table public.eqa_corrective_actions
  add constraint eqa_corrective_actions_effectiveness_outcome_check
    check (effectiveness_outcome in ('pending', 'effective', 'ineffective'));

create index if not exists eqa_corrective_actions_due_open
  on public.eqa_corrective_actions(due_date)
  where status <> 'closed';

-- Rounds materialised from a plan occurrence carry their 1..n position so
-- that generating rounds from the plan is idempotent. Hand-created rounds
-- stay null until adopted by the generator.
alter table public.eqa_rounds
  add column if not exists sequence_no integer
    check (sequence_no is null or sequence_no > 0);

create unique index if not exists eqa_rounds_plan_item_sequence
  on public.eqa_rounds(plan_item_id, sequence_no)
  where plan_item_id is not null and sequence_no is not null;
