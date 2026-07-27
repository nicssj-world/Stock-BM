-- Annual EQA summaries are approved online by the technical manager and
-- section head. The remaining roles sign the printed controlled document.
-- Reconcile existing approvals that were complete under this workflow but
-- remained marked as drafts under the former four-role requirement.
update public.eqa_document_states as state
set status = 'approved', updated_at = now()
where state.document_type = 'annual-summary'
  and exists (
    select 1
    from public.eqa_document_approvals as approval
    where approval.document_type = state.document_type
      and approval.entity_id = state.entity_id
      and approval.revision = state.revision
      and approval.approval_role = 'technical-manager'
  )
  and exists (
    select 1
    from public.eqa_document_approvals as approval
    where approval.document_type = state.document_type
      and approval.entity_id = state.entity_id
      and approval.revision = state.revision
      and approval.approval_role = 'section-head'
  );
