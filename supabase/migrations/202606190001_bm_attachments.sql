-- Shared file attachments for the quality modules (IQC / EQA) and stock.
-- Files live in a private Supabase Storage bucket; all access goes through the
-- service-role admin client (no anon/public access), so no storage.objects RLS
-- policies are required. Metadata is tracked in bm_attachments.

create table public.bm_attachments (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('iqc', 'eqa', 'stock')),
  entity_type text not null check (nullif(trim(entity_type), '') is not null),
  entity_id uuid,
  kind text not null check (nullif(trim(kind), '') is not null),
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

create index bm_attachments_entity on public.bm_attachments(module, entity_type, entity_id);
create index bm_attachments_created_at on public.bm_attachments(created_at desc);

alter table public.bm_attachments enable row level security;

create policy bm_attachments_active_read on public.bm_attachments
for select using (public.current_bm_role() is not null);

-- Private bucket for quality documents (corrective actions, EQA certificates, etc.)
insert into storage.buckets (id, name, public)
values ('bm-quality', 'bm-quality', false)
on conflict (id) do nothing;
