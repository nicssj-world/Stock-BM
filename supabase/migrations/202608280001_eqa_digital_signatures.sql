-- Store a drawn signature and the name shown on the controlled EQA document.
-- The existing approval row remains the audit record for the logged-in account;
-- signer_name allows the two external approver roles to sign on a shared phone
-- without requiring a portal account.
alter table public.eqa_document_approvals
  add column if not exists signer_name text,
  add column if not exists signature_attachment_id uuid references public.bm_attachments(id) on delete set null;

create index if not exists eqa_document_approvals_signature
  on public.eqa_document_approvals(signature_attachment_id);
