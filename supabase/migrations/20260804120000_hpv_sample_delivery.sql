-- Split HPV sample checkout into two steps: the sample leaves storage (pending
-- delivery) and is later physically handed over to a receiver who signs for it.
-- Each handover is one bm_hpv_sample_deliveries row holding the receiver's
-- e-signature (stored in bm_attachments) plus the date/time it was accepted.

create table public.bm_hpv_sample_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_code text not null unique,
  destination text,
  receiver_name text,
  note text,
  sample_count integer not null default 0,
  signature_attachment_id uuid references public.bm_attachments(id) on delete set null,
  delivered_at timestamptz not null default now(),
  created_by uuid not null references public.nipt_users(id),
  created_at timestamptz not null default now()
);

alter table public.bm_hpv_sample_deliveries enable row level security;

alter table public.bm_hpv_samples
  add column delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivered')),
  add column delivery_id uuid references public.bm_hpv_sample_deliveries(id) on delete set null;

comment on column public.bm_hpv_samples.delivery_status is
  'Only meaningful while status = checked_out: pending = waiting to be handed over, delivered = receiver signed for it.';

create index bm_hpv_samples_delivery_status_idx on public.bm_hpv_samples (delivery_status);
create index bm_hpv_samples_delivery_id_idx on public.bm_hpv_samples (delivery_id);

-- Backfill: everything already checked out predates this feature and was handed
-- over on paper, so treat it as delivered (with no delivery row to point at).
update public.bm_hpv_samples set delivery_status = 'delivered' where status = 'checked_out';
update public.bm_hpv_samples set delivery_status = 'pending' where barcode = '2620470165188';

notify pgrst, 'reload schema';
