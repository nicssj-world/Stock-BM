-- OCR is a draft/audit path only. It must not create or alter stock ledger rows.
do $$
declare
  v_before_transactions bigint;
  v_after_transactions bigint;
begin
  select count(*) into v_before_transactions from public.bm_stock_transactions;

  insert into public.bm_ocr_jobs (
    id, workflow, status, engine, engine_version, languages, raw_text, confidence, created_by
  ) values (
    '83000000-0000-0000-0000-000000000001', 'invoice', 'completed', 'tesseract.js', '7.0.0',
    'tha+eng', 'CAT-001 LOT L0-18', 91.2, '00000000-0000-0000-0000-000000000001'
  ) on conflict (id) do nothing;

  insert into public.bm_ocr_candidates (
    id, ocr_job_id, line_no, source_text, catalog_no_text, lot_text, expected_qty,
    stock_item_id, match_method, match_confidence, candidate_item_ids
  ) values (
    '84000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001', 1, 'CAT-001 LOT L0-18', 'CAT-001', 'L0-18', 2,
    '30000000-0000-0000-0000-000000000001', 'exact_unique', 1,
    '["30000000-0000-0000-0000-000000000001"]'::jsonb
  ) on conflict (id) do nothing;

  select count(*) into v_after_transactions from public.bm_stock_transactions;
  if v_after_transactions <> v_before_transactions then
    raise exception 'L0-18: OCR changed stock transaction count';
  end if;
  if not exists (
    select 1 from public.bm_ocr_jobs
    where id = '83000000-0000-0000-0000-000000000001'
      and workflow = 'invoice' and raw_text = 'CAT-001 LOT L0-18'
  ) then
    raise exception 'L0-18: OCR job was not stored';
  end if;
  if not exists (
    select 1 from public.bm_ocr_candidates
    where ocr_job_id = '83000000-0000-0000-0000-000000000001'
      and match_method = 'exact_unique'
      and candidate_item_ids @> '["30000000-0000-0000-0000-000000000001"]'::jsonb
  ) then
    raise exception 'L0-18: OCR candidate was not stored';
  end if;
end;
$$;

select 'L0-18 PASS: OCR audit/candidate records remain outside the stock ledger.' as result;
