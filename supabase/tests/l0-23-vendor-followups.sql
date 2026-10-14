-- L0-23: Follow-up behavior against real Postgres on a disposable local database.
-- Reuses deterministic L0-22 actors and finalized report; does not target Production.
do $$
declare
  v_admin uuid := '00000000-0000-0000-0000-000000000001';
  v_staff uuid := '22000000-0000-0000-0000-000000000002';
  v_vendor uuid;
  v_revision public.bm_vendor_annual_evaluation_revisions%rowtype;
  v_followup uuid;
  v_stamp timestamptz;
  v_failed boolean := false;
begin
  select id into v_vendor from public.bm_vendors where code='L0-22-A';
  if v_vendor is null then raise exception 'L0-23 requires L0-22'; end if;
  select r.* into v_revision from public.bm_vendor_annual_evaluation_revisions r
    join public.bm_vendor_annual_evaluations e on e.id=r.evaluation_id
    where e.vendor_id=v_vendor and r.status='final' order by r.revision_number desc limit 1;
  if v_revision.id is null then raise exception 'L0-23 requires the finished L0-22 report'; end if;

  -- A synthetic failed revision exercises the AFTER trigger. The original finalized report is untouched.
  insert into public.bm_vendor_annual_evaluation_revisions (
    evaluation_id,revision_number,supersedes_revision_id,policy_id,status,evidence_snapshot,evidence_hash,
    frozen_snapshot,report_fiscal_year,report_sequence,report_number,judgment_summary,strengths,risks_concerns,recommendations,
    evaluator_id,evaluator_name_snapshot,evaluator_position_snapshot,evaluator_signature,
    reviewer_id,reviewer_name_snapshot,reviewer_position_snapshot,reviewer_signature,
    approver_id,approver_name_snapshot,approver_position_snapshot,approver_signature,
    finalized_at,finalized_by,created_by,updated_by
  ) values (
    v_revision.evaluation_id,v_revision.revision_number+1,v_revision.id,v_revision.policy_id,
    'final',v_revision.evidence_snapshot,v_revision.evidence_hash,
    jsonb_set(v_revision.frozen_snapshot,'{result}','"fail"'::jsonb),
    v_revision.report_fiscal_year,9998,'VE-'||v_revision.report_fiscal_year||'-9998',
    null,null,null,null,
    v_revision.evaluator_id,v_revision.evaluator_name_snapshot,v_revision.evaluator_position_snapshot,v_revision.evaluator_signature,
    v_revision.reviewer_id,v_revision.reviewer_name_snapshot,v_revision.reviewer_position_snapshot,v_revision.reviewer_signature,
    v_revision.approver_id,v_revision.approver_name_snapshot,v_revision.approver_position_snapshot,v_revision.approver_signature,
    now(),v_admin,v_admin,v_admin
  ) returning id into v_followup;

  select id into v_followup from public.bm_vendor_annual_followups where revision_id=v_followup;
  if v_followup is null then raise exception 'L0-23 failed report did not create follow-up'; end if;
  if (select status from public.bm_vendor_annual_followups where id=v_followup) <> 'open' then
    raise exception 'L0-23 wrong initial follow-up status'; end if;
  select updated_at into v_stamp from public.bm_vendor_annual_followups where id=v_followup;
  begin
    perform public.update_bm_vendor_annual_followup(v_staff,v_vendor,v_followup,'closed',v_staff,current_date,'plan','done',v_stamp);
  exception when others then v_failed := sqlerrm like '%BM_ACCESS_DENIED%'; end;
  if not v_failed then raise exception 'L0-23 staff must not close followup'; end if;
  v_failed := false;
  begin
    perform public.update_bm_vendor_annual_followup(v_admin,v_vendor,v_followup,'in_progress',null,null,'plan',null,v_stamp);
  exception when others then v_failed := sqlerrm like '%BM_VENDOR_FOLLOWUP_PLAN_REQUIRED%'; end;
  if not v_failed then raise exception 'L0-23 progress must require assignment and deadline'; end if;

  perform public.update_bm_vendor_annual_followup(v_admin,v_vendor,v_followup,'in_progress',v_staff,current_date+7,'แจ้งผู้ขายและติดตามการแก้ไข',null,v_stamp);
  select updated_at into v_stamp from public.bm_vendor_annual_followups where id=v_followup;
  v_failed := false;
  begin
    perform public.update_bm_vendor_annual_followup(v_admin,v_vendor,v_followup,'closed',v_staff,current_date+7,'plan',null,v_stamp);
  exception when others then v_failed := sqlerrm like '%BM_VENDOR_FOLLOWUP_RESOLUTION_REQUIRED%'; end;
  if not v_failed then raise exception 'L0-23 close must require resolution'; end if;

  perform public.update_bm_vendor_annual_followup(v_admin,v_vendor,v_followup,'closed',v_staff,current_date+7,'แจ้งผู้ขายและติดตามการแก้ไข','ผู้ขายส่งหลักฐานการแก้ไขแล้ว',v_stamp);
  if (select status from public.bm_vendor_annual_followups where id=v_followup) <> 'closed' then raise exception 'L0-23 did not close'; end if;
  raise notice 'L0-23 VENDOR FOLLOW-UP PASS: failed revision auto-open, role guards, assignment, deadline, resolution verified.';
end $$;
