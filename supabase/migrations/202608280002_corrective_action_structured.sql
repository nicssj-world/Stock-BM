-- Structured Corrective Action details shared by IQC and EQA.
-- Existing rows intentionally remain nullable/empty: their historical content
-- is not inferred or backfilled. New UI/API validation gates completion.

alter table public.iqc_corrective_actions
  add column if not exists result_id uuid references public.iqc_result_values(id),
  add column if not exists issue_types text[] not null default '{}',
  add column if not exists probable_error_type text,
  add column if not exists probable_error_note text,
  add column if not exists review_findings jsonb not null default '{}'::jsonb,
  add column if not exists action_types text[] not null default '{}',
  add column if not exists correction_outcome text,
  add column if not exists correction_outcome_note text,
  add column if not exists preventive_action text;

alter table public.iqc_corrective_actions
  drop constraint if exists iqc_corrective_actions_probable_error_type_check,
  drop constraint if exists iqc_corrective_actions_correction_outcome_check;

alter table public.iqc_corrective_actions
  add constraint iqc_corrective_actions_probable_error_type_check
    check (probable_error_type is null or probable_error_type in ('random', 'systematic', 'unknown', 'other')),
  add constraint iqc_corrective_actions_correction_outcome_check
    check (correction_outcome is null or correction_outcome in ('corrected', 'not-corrected', 'monitoring', 'other'));

create index if not exists iqc_corrective_actions_result on public.iqc_corrective_actions(result_id);

alter table public.eqa_corrective_actions
  add column if not exists issue_types text[] not null default '{}',
  add column if not exists probable_error_type text,
  add column if not exists probable_error_note text,
  add column if not exists review_findings jsonb not null default '{}'::jsonb,
  add column if not exists action_types text[] not null default '{}',
  add column if not exists correction_outcome text,
  add column if not exists correction_outcome_note text,
  add column if not exists preventive_action text;

alter table public.eqa_corrective_actions
  drop constraint if exists eqa_corrective_actions_probable_error_type_check,
  drop constraint if exists eqa_corrective_actions_correction_outcome_check;

alter table public.eqa_corrective_actions
  add constraint eqa_corrective_actions_probable_error_type_check
    check (probable_error_type is null or probable_error_type in ('random', 'systematic', 'unknown', 'other')),
  add constraint eqa_corrective_actions_correction_outcome_check
    check (correction_outcome is null or correction_outcome in ('corrected', 'not-corrected', 'monitoring', 'other'));

create index if not exists eqa_corrective_actions_result on public.eqa_corrective_actions(result_id);

comment on column public.iqc_corrective_actions.result_id is 'Exact IQC result link for graph-originated Corrective Actions; null means legacy/run-level scope.';
comment on column public.iqc_corrective_actions.review_findings is 'Checklist keyed by shared/module review category with status and note.';
comment on column public.eqa_corrective_actions.review_findings is 'Checklist keyed by shared/module review category with status and note.';
