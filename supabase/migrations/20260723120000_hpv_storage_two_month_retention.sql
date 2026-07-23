-- HPV storage boxes are retained for two calendar months after being closed/full.
-- Recalculate existing active boxes so they follow the same rule as newly closed boxes.
update public.bm_hpv_storage_boxes
set destroy_due_at = (
  timezone('Asia/Bangkok', filled_at) + interval '2 months'
) at time zone 'Asia/Bangkok',
updated_at = now()
where status = 'full'
  and filled_at is not null
  and destroyed_at is null;
