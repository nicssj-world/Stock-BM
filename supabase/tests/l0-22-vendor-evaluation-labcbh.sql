-- L0-22: the LABCBH-Stock vendor evaluation port. Vendor master, closing an invoice short, receipt event numbers, assessment rules and
-- revisions, issue reconciliation, the shared policy, signers, and the annual report (draft -> finalize) with its guards.
create or replace function pg_temp.expect_err(p_sql text, p_code text) returns void language plpgsql as $$
declare v_msg text; v_failed boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true; v_msg := sqlerrm;
  end;
  if not v_failed then raise exception 'L0-22 expected % but the statement succeeded: %', p_code, p_sql; end if;
  if v_msg not like '%' || p_code || '%' then raise exception 'L0-22 expected % but got "%" for: %', p_code, v_msg, p_sql; end if;
end $$;

do $$
declare
  v_admin uuid := '00000000-0000-0000-0000-000000000001';
  v_admin2 uuid := '22000000-0000-0000-0000-000000000001';
  v_staff uuid := '22000000-0000-0000-0000-000000000002';
  v_assistant uuid := '22000000-0000-0000-0000-000000000003';
  v_item uuid := '30000000-0000-0000-0000-000000000022';
  v_location uuid := '20000000-0000-0000-0000-000000000001';
  v_png text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  v_vendor uuid; v_vendor2 uuid;
  v_inv1 uuid; v_line1 uuid; v_inv2 uuid; v_line2 uuid;
  v_r1 uuid := '22aa0000-0000-0000-0000-000000000001';
  v_r2 uuid := '22aa0000-0000-0000-0000-000000000002';
  v_r3 uuid := '22aa0000-0000-0000-0000-000000000003';
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_issue uuid; v_updated timestamptz;
  v_orig_enabled boolean; v_orig_exception boolean;
  v_policy uuid; v_rev uuid; v_rev2 uuid; v_number text; v_frozen jsonb;
  v_expected numeric; v_weights numeric; v_count integer;
  v_fy integer := 2569;
  v_seq1 integer;
begin
  -- Its own stock item, so the lots this suite receives never change FEFO suggestions for the other suites.
  insert into public.bm_stock_items (id, item_code, name, category_id, unit, minimum_stock, track_lot, track_expiry, created_by)
  values (v_item, 'L0-22-ITEM', 'L0-22 reagent', '10000000-0000-0000-0000-000000000001', 'กล่อง', 0, true, true, v_admin) on conflict (id) do nothing;
  -- Actors: Admin (seeded), a second Admin, Staff and Assistant.
  insert into public.nipt_users(id, ephis_id, display_name, role, is_active) values
    (v_admin2, 'L0-22-ADMIN2', 'L0-22 admin two', 'Admin', true),
    (v_staff, 'L0-22-STAFF', 'L0-22 staff', 'CBH-Staff', true),
    (v_assistant, 'L0-22-ASSIST', 'L0-22 assistant', 'CBH-Staff', true) on conflict (id) do nothing;
  insert into public.bm_user_access(user_id, role, is_active) values (v_admin2, 'Admin', true), (v_staff, 'Staff', true), (v_assistant, 'Assistant', true)
    on conflict (user_id) do update set role = excluded.role, is_active = true;
  -- Every receipt below is "required" for assessment, whatever day the suite runs.
  update public.bm_vendor_evaluation_settings set assessment_required_from = date '2026-01-01';
  select is_enabled, expiry_exception_enabled into v_orig_enabled, v_orig_exception from public.bm_receiving_policies order by version desc limit 1;
  update public.bm_receiving_policies set is_enabled = true, expiry_exception_enabled = true where version = (select max(version) from public.bm_receiving_policies);

  -- ---- Vendor master ------------------------------------------------------------------------------------------------
  v_vendor := public.create_bm_vendor(v_admin, '{"code":"l0-22-a","name":"L0-22 Alpha","taxId":"0105551234567","contactPerson":"K. A"}'::jsonb);
  if (select code from public.bm_vendors where id = v_vendor) <> 'L0-22-A' then raise exception 'L0-22 vendor code was not upper-cased'; end if;
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_staff, '{"code":"X","name":"X"}'), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_admin, '{"code":"L0-22-a ","name":"Other"}'), 'BM_VENDOR_CODE_TAKEN');
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_admin, '{"code":"L0-22-B","name":"l0-22 alpha"}'), 'BM_VENDOR_NAME_TAKEN');
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_admin, '{"code":"L0-22-B","name":"Beta","taxId":"0105551234567"}'), 'BM_VENDOR_TAX_TAKEN');
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_admin, '{"code":"L0-22-B","name":"Beta","taxId":"123"}'), 'bm_vendors_tax_id_format');
  perform pg_temp.expect_err(format('select public.create_bm_vendor(%L, %L::jsonb)', v_admin, '{"code":"L0-22-B","name":"Beta","hack":1}'), 'BM_VENDOR_FIELD_INVALID');
  select updated_at into v_updated from public.bm_vendors where id = v_vendor;
  perform public.update_bm_vendor(v_admin, v_vendor, '{"phone":"038-000000","contactPerson":""}'::jsonb, v_updated);
  if (select phone from public.bm_vendors where id = v_vendor) <> '038-000000' or (select contact_person from public.bm_vendors where id = v_vendor) is not null
     or (select tax_id from public.bm_vendors where id = v_vendor) <> '0105551234567' then raise exception 'L0-22 vendor patch semantics are wrong'; end if;
  perform pg_temp.expect_err(format('select public.update_bm_vendor(%L, %L, %L::jsonb, %L)', v_admin, v_vendor, '{"phone":"1"}', v_updated), 'BM_STALE_DATA');
  perform pg_temp.expect_err(format('select public.set_bm_vendor_active(%L, %L, false, %L)', v_admin, v_vendor, ' '), 'BM_REASON_REQUIRED');
  perform public.set_bm_vendor_active(v_admin, v_vendor, false, 'Contract ended');
  perform public.set_bm_vendor_active(v_admin, v_vendor, true, null);
  v_vendor2 := public.create_bm_vendor(v_admin, '{"code":"L0-22-B","name":"L0-22 Beta"}'::jsonb);

  -- ---- Invoice 1: 10 expected, 6 received in the first receipt --------------------------------------------------------
  insert into public.bm_invoices(vendor_id, invoice_no, invoice_date, status, created_by) values (v_vendor, 'L0-22-INV-1', '2026-09-17', 'open', v_admin) returning id into v_inv1;
  insert into public.bm_invoice_lines(invoice_id, line_no, stock_item_id, description_text, expected_qty) values (v_inv1, 1, v_item, 'L0-22 line 1', 10) returning id into v_line1;
  insert into public.bm_receipts(id, receipt_no, invoice_id, vendor_id, received_date, received_by, created_by) values (v_r1, 'L0-22-R1', v_inv1, v_vendor, '2026-09-18', v_admin, v_admin);
  insert into public.bm_receipt_lines(receipt_id, line_no, invoice_line_id, stock_item_id, lot_number, expiry_date, lot_mode, location_id, received_qty, tor_expiry_compliance)
    values (v_r1, 1, v_line1, v_item, 'L0-22-LOT-1', '2036-05-31', 'new', v_location, 6, 'compliant');
  perform public.confirm_bm_receipt(v_r1, v_admin);
  -- Earlier suites confirm receipts too, so the sequence is checked relative to this receipt.
  select sequence_number into v_seq1 from public.bm_receipt_event_numbers where receipt_id = v_r1;
  if (select event_number from public.bm_receipt_event_numbers where receipt_id = v_r1) <> 'RC-' || v_fy || '-' || lpad(v_seq1::text, 4, '0') then raise exception 'L0-22 receipt event number is wrong'; end if;
  if (select status from public.bm_invoices where id = v_inv1) <> 'open' or (select closure_state from public.bm_invoice_lines where id = v_line1) <> 'open' then
    raise exception 'L0-22 a partial receipt must leave the invoice and line open';
  end if;
  select id into v_a1 from public.bm_receipt_assessments where receipt_id = v_r1;

  -- ---- Assessment rules ------------------------------------------------------------------------------------------------
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_assistant, v_r1, '{}'), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1, '{"productCondition":"normal"}'), 'BM_ASSESSMENT_REQUIRED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1,
    '{"productCondition":"abnormal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"note":"box dented"}'), 'BM_ASSESSMENT_REASON_REQUIRED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1,
    '{"productCondition":"abnormal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"reasonCodes":["usable_condition"]}'), 'BM_ASSESSMENT_NOTE_REQUIRED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1,
    '{"productCondition":"normal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"reasonCodes":["urgent_need"]}'), 'BM_ASSESSMENT_REASON_NOT_ALLOWED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1,
    '{"productCondition":"abnormal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"note":"n","reasonCodes":["other"]}'), 'BM_ASSESSMENT_OTHER_REASON_REQUIRED');
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1,
    '{"productCondition":"normal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":true,"hasComplaint":false}'), 'BM_ASSESSMENT_REQUIRED');
  perform public.complete_bm_receipt_assessment(v_staff, v_r1,
    '{"productCondition":"abnormal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"note":"box dented","reasonCodes":["usable_condition","vendor_will_correct"]}'::jsonb);
  if (select acceptance_decision from public.bm_receipt_assessments where id = v_a1) <> 'accepted_with_justification' then raise exception 'L0-22 decision was not derived'; end if;
  if (select count(*) from public.bm_vendor_issues where assessment_id = v_a1 and issue_type = 'packaging_damage' and resolution_status = 'open') <> 1 then raise exception 'L0-22 packaging issue was not opened'; end if;
  perform pg_temp.expect_err(format('select public.complete_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_r1, '{}'), 'BM_ASSESSMENT_ALREADY_COMPLETED');

  -- Revising: Admin only, recorded, and the issue follows the corrected answers.
  perform pg_temp.expect_err(format('select public.revise_bm_receipt_assessment(%L, %L, %L::jsonb)', v_staff, v_a1, '{}'), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.revise_bm_receipt_assessment(%L, %L, %L::jsonb)', v_admin, v_a1,
    '{"productCondition":"abnormal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false,"note":"box dented","reasonCodes":["usable_condition","vendor_will_correct"]}'), 'BM_ASSESSMENT_UNCHANGED');
  perform public.revise_bm_receipt_assessment(v_admin, v_a1, '{"productCondition":"normal","documentation":"complete","itemCorrectness":"correct","coldChainApplicable":false,"hasComplaint":false}'::jsonb);
  if (select count(*) from public.bm_receipt_assessment_revisions where assessment_id = v_a1) <> 1 then raise exception 'L0-22 revision was not recorded'; end if;
  if (select resolution_status || '/' || cancelled_reason from public.bm_vendor_issues where assessment_id = v_a1 and issue_type = 'packaging_damage') <> 'cancelled/assessment_corrected' then
    raise exception 'L0-22 correcting the assessment did not cancel its issue';
  end if;

  -- ---- Closing invoice 1 short -------------------------------------------------------------------------------------------
  perform pg_temp.expect_err(format('select public.close_bm_invoice_short(%L, %L, %L)', v_staff, v_inv1, 'stock out'), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.close_bm_invoice_short(%L, %L, %L)', v_admin, v_inv1, ' '), 'BM_REASON_REQUIRED');
  insert into public.bm_receipts(id, receipt_no, invoice_id, vendor_id, received_date, received_by, created_by) values (v_r3, 'L0-22-R3-DRAFT', v_inv1, v_vendor, '2026-09-19', v_admin, v_admin);
  perform pg_temp.expect_err(format('select public.close_bm_invoice_short(%L, %L, %L)', v_admin, v_inv1, 'stock out'), 'BM_INVOICE_HAS_DRAFT_RECEIPT');
  delete from public.bm_receipts where id = v_r3;
  perform public.close_bm_invoice_short(v_admin, v_inv1, 'Vendor out of stock');
  if (select status || '/' || (closed_short_by = v_admin)::text from public.bm_invoices where id = v_inv1) <> 'closed/true' then raise exception 'L0-22 invoice was not closed short'; end if;
  if (select closure_state from public.bm_invoice_lines where id = v_line1) <> 'short_closed' then raise exception 'L0-22 outstanding line was not short closed'; end if;
  if (select count(*) from public.bm_vendor_issues where invoice_line_id = v_line1 and issue_type = 'quantity_discrepancy' and source_kind = 'invoice_closure') <> 1 then raise exception 'L0-22 closing short opened no quantity issue'; end if;
  perform pg_temp.expect_err(format('select public.close_bm_invoice_short(%L, %L, %L)', v_admin, v_inv1, 'again'), 'BM_INVOICE_NOT_OPEN');

  -- ---- Invoice 2: received in full closes by itself; a lot inside the TOR window opens an expiry issue -----------------------
  insert into public.bm_invoices(vendor_id, invoice_no, invoice_date, status, created_by) values (v_vendor, 'L0-22-INV-2', '2026-09-18', 'open', v_admin) returning id into v_inv2;
  insert into public.bm_invoice_lines(invoice_id, line_no, stock_item_id, description_text, expected_qty) values (v_inv2, 1, v_item, 'L0-22 line 2', 4) returning id into v_line2;
  insert into public.bm_receipts(id, receipt_no, invoice_id, vendor_id, received_date, received_by, created_by) values (v_r2, 'L0-22-R2', v_inv2, v_vendor, '2026-09-18', v_admin, v_admin);
  insert into public.bm_receipt_lines(receipt_id, line_no, invoice_line_id, stock_item_id, lot_number, expiry_date, lot_mode, location_id, received_qty, tor_expiry_compliance,
      receipt_decision, acceptance_reason_code)
    values (v_r2, 1, v_line2, v_item, 'L0-22-LOT-2', '2026-12-01', 'new', v_location, 4, 'not_compliant', 'accepted_with_justification', 'urgent_need');
  perform public.confirm_bm_receipt(v_r2, v_admin);
  if (select status || '/' || (closed_short_at is null)::text from public.bm_invoices where id = v_inv2) <> 'closed/true' then raise exception 'L0-22 a full receipt did not close the invoice'; end if;
  if (select closure_state from public.bm_invoice_lines where id = v_line2) <> 'complete' then raise exception 'L0-22 fulfilled line was not completed'; end if;
  if (select event_number from public.bm_receipt_event_numbers where receipt_id = v_r2) <> 'RC-' || v_fy || '-' || lpad((v_seq1 + 1)::text, 4, '0') then raise exception 'L0-22 event numbers are not gap-free'; end if;
  if (select count(*) from public.bm_vendor_issues where source_kind = 'receipt_line' and issue_type = 'expiry_non_compliant' and vendor_id = v_vendor) <> 1 then raise exception 'L0-22 TOR exception opened no expiry issue'; end if;
  select id into v_a2 from public.bm_receipt_assessments where receipt_id = v_r2;
  perform public.complete_bm_receipt_assessment(v_staff, v_r2, '{"productCondition":"normal","documentation":"incomplete","itemCorrectness":"correct","coldChainApplicable":true,"coldChainCondition":"appropriate","hasComplaint":false,"note":"invoice copy missing","reasonCodes":["documentation_pending"]}'::jsonb);
  select id into v_a3 from public.bm_receipt_assessments where receipt_id = v_r1;

  -- ---- Manual issues ---------------------------------------------------------------------------------------------------------
  perform pg_temp.expect_err(format('select public.open_bm_vendor_issue(%L, %L, %L, %L)', v_assistant, v_vendor, 'complaint', 'x'), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.open_bm_vendor_issue(%L, %L, %L, %L)', v_staff, v_vendor, 'complaint', ' '), 'BM_ISSUE_DESCRIPTION_REQUIRED');
  perform pg_temp.expect_err(format('select public.open_bm_vendor_issue(%L, %L, %L, %L)', v_staff, v_vendor, 'made_up', 'x'), 'bm_vendor_issues_type_check');
  perform pg_temp.expect_err(format('select public.open_bm_vendor_issue(%L, %L, %L, %L, null, %L)', v_staff, v_vendor2, 'complaint', 'x', v_inv1), 'BM_VENDOR_INVOICE_INVALID');
  v_issue := public.open_bm_vendor_issue(v_staff, v_vendor, 'complaint', 'wrong lot label', null, v_inv2);
  perform pg_temp.expect_err(format('select public.resolve_bm_vendor_issue(%L, %L, %L, %L)', v_staff, v_issue, 'vendor_warned', 'x'), 'BM_ACCESS_DENIED');
  perform public.resolve_bm_vendor_issue(v_admin, v_issue, 'vendor_warned', 'Vendor was warned');
  perform pg_temp.expect_err(format('select public.cancel_bm_vendor_issue(%L, %L, %L, null)', v_admin, v_issue, 'other'), 'BM_ISSUE_CANCEL_NOTE_REQUIRED');

  -- ---- Policy -------------------------------------------------------------------------------------------------------------------
  select id into v_policy from public.bm_vendor_evaluation_policies where version = 'VE-POLICY-V1';
  if (select status || '/' || pass_threshold || '/' || minimum_coverage_percent from public.bm_vendor_evaluation_policies where id = v_policy) <> 'proposed/80.00/80.00' then raise exception 'L0-22 V1 is not the LABCBH proposal'; end if;
  if (select array_to_string(array_agg(weight::integer order by display_order), ',') from public.bm_vendor_evaluation_policy_criteria where policy_id = v_policy) <> '20,15,10,10,15,15,10,5' then raise exception 'L0-22 V1 weights are not the LABCBH weights'; end if;
  perform pg_temp.expect_err(format('select public.approve_bm_vendor_evaluation_policy(%L, %L)', v_staff, v_policy), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.create_bm_vendor_annual_evaluation_draft(%L, %L, %L)', v_staff, v_vendor, v_fy), 'BM_ACCESS_DENIED');
  -- A draft can be opened on the proposal, but it can not be finalized until the policy is approved.
  v_rev := public.create_bm_vendor_annual_evaluation_draft(v_admin, v_vendor, v_fy);
  if public.create_bm_vendor_annual_evaluation_draft(v_admin, v_vendor, v_fy) <> v_rev then raise exception 'L0-22 a second draft was created for the same year'; end if;
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, %L)', v_admin, v_rev), 'BM_POLICY_NOT_APPROVED');
  perform public.approve_bm_vendor_evaluation_policy(v_admin, v_policy);
  if (select approved_by from public.bm_vendor_evaluation_policies where id = v_policy) <> v_admin then raise exception 'L0-22 approver was not stamped'; end if;
  perform pg_temp.expect_err(format('select public.approve_bm_vendor_evaluation_policy(%L, %L)', v_admin, v_policy), 'BM_POLICY_NOT_PROPOSED');
  perform pg_temp.expect_err(format('update public.bm_vendor_evaluation_policies set pass_threshold = 1 where id = %L', v_policy), 'BM_POLICY_FROZEN');
  perform pg_temp.expect_err(format('update public.bm_vendor_evaluation_policy_criteria set weight = 1 where policy_id = %L and criterion_code = %L', v_policy, 'shelf_life'), 'BM_POLICY_FROZEN');

  -- ---- Signers ---------------------------------------------------------------------------------------------------------------------
  perform pg_temp.expect_err(format('select public.set_bm_user_position(%L, %L, %L)', v_staff, v_admin, 'Boss'), 'BM_ACCESS_DENIED');
  perform public.set_bm_user_position(v_staff, v_staff, 'Medical technologist');
  perform public.set_bm_user_position(v_admin, v_admin, 'Head of lab');
  perform public.set_bm_user_position(v_admin, v_admin2, 'Deputy head');
  perform pg_temp.expect_err(format('select public.save_bm_user_signature(%L, %L)', v_staff, 'not-a-png'), 'BM_SIGNATURE_INVALID');
  perform pg_temp.expect_err(format('select public.save_bm_user_signature(%L, %L)', v_staff, 'data:image/png;base64,QUJDREVGR0g='), 'BM_SIGNATURE_INVALID');
  perform public.save_bm_user_signature(v_staff, v_png);
  perform public.save_bm_user_signature(v_admin, v_png);
  perform pg_temp.expect_err(format('select public.list_bm_evaluation_signers(%L)', v_staff), 'BM_ACCESS_DENIED');
  if jsonb_array_length(public.list_bm_evaluation_signers(v_admin)) < 3 then raise exception 'L0-22 signers were not listed'; end if;

  -- ---- Annual evaluation -------------------------------------------------------------------------------------------------------------
  perform public.save_bm_vendor_annual_evaluation_draft(v_admin, v_rev, '{"summary":"s","strengths":"g","risksConcerns":"r","recommendations":"c","evaluatorId":"22000000-0000-0000-0000-000000000002","reviewerId":"00000000-0000-0000-0000-000000000001","approverId":"22000000-0000-0000-0000-000000000001"}'::jsonb);
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, %L)', v_admin, v_rev), 'BM_ANNUAL_SIGNATURE_MISSING');
  perform public.save_bm_user_signature(v_admin2, v_png);
  -- Evidence that changes after the draft was captured blocks finalizing until it is refreshed.
  perform public.open_bm_vendor_issue(v_staff, v_vendor, 'other', 'raised after the draft');
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, %L)', v_staff, v_rev), 'BM_ACCESS_DENIED');
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, %L)', v_admin, v_rev), 'BM_ANNUAL_EVIDENCE_STALE');
  perform public.refresh_bm_vendor_annual_evaluation_draft(v_admin, v_rev);
  v_number := public.finalize_bm_vendor_annual_evaluation(v_admin, v_rev);
  if v_number <> 'VE-' || v_fy || '-0001' then raise exception 'L0-22 report number is % ', v_number; end if;
  select frozen_snapshot into v_frozen from public.bm_vendor_annual_evaluation_revisions where id = v_rev;
  select sum((c ->> 'weight')::numeric) into v_weights from jsonb_array_elements(v_frozen -> 'criteria') c where (c ->> 'applicable')::boolean;
  select sum((c ->> 'numerator')::numeric / (c ->> 'denominator')::numeric * (c ->> 'weight')::numeric / v_weights * 100) into v_expected from jsonb_array_elements(v_frozen -> 'criteria') c where (c ->> 'applicable')::boolean;
  if abs((v_frozen ->> 'score')::numeric - v_expected) > 0.01 then raise exception 'L0-22 score % is not the weighted share %', v_frozen ->> 'score', v_expected; end if;
  if (v_frozen ->> 'result') <> (case when (v_frozen ->> 'score')::numeric >= 80 then 'pass' else 'fail' end) then raise exception 'L0-22 pass/fail is wrong'; end if;
  -- Cold chain applied to one receipt only and delivery data exists for closed invoices, so every criterion here has a denominator.
  select count(*) into v_count from jsonb_array_elements(v_frozen -> 'criteria') c where (c ->> 'applicable')::boolean;
  if v_count < 6 then raise exception 'L0-22 too few applicable criteria: %', v_count; end if;
  if (select evaluator_signature from public.bm_vendor_annual_evaluation_revisions where id = v_rev) <> v_png then raise exception 'L0-22 signature was not copied into the report'; end if;

  -- A final report is a record.
  perform pg_temp.expect_err(format('select public.save_bm_vendor_annual_evaluation_draft(%L, %L, %L::jsonb)', v_admin, v_rev, '{"summary":"x"}'), 'BM_ANNUAL_REVISION_IMMUTABLE');
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, %L)', v_admin, v_rev), 'BM_ANNUAL_REVISION_IMMUTABLE');
  perform pg_temp.expect_err(format('update public.bm_vendor_annual_evaluation_revisions set judgment_summary = %L where id = %L', 'tampered', v_rev), 'BM_ANNUAL_REVISION_IMMUTABLE');
  perform pg_temp.expect_err(format('delete from public.bm_vendor_annual_evaluation_revisions where id = %L', v_rev), 'BM_ANNUAL_REVISION_IMMUTABLE');
  v_rev2 := public.create_bm_vendor_annual_evaluation_draft(v_admin, v_vendor, v_fy);
  if (select revision_number || '/' || (supersedes_revision_id = v_rev)::text || '/' || judgment_summary from public.bm_vendor_annual_evaluation_revisions where id = v_rev2) <> '2/true/s' then
    raise exception 'L0-22 revision 2 does not supersede revision 1 with its wording';
  end if;
  if (select evaluator_signature from public.bm_vendor_annual_evaluation_revisions where id = v_rev2) is not null then raise exception 'L0-22 a draft carries a signature'; end if;
  -- Annual narrative fields are optional, while three signers and signatures remain compulsory.
  perform public.save_bm_vendor_annual_evaluation_draft(v_admin, v_rev2, jsonb_build_object(
    'summary', '', 'strengths', '', 'risksConcerns', '', 'recommendations', '',
    'evaluatorId', v_staff, 'reviewerId', v_admin, 'approverId', v_admin2));
  if public.finalize_bm_vendor_annual_evaluation(v_admin, v_rev2) <> 'VE-' || v_fy || '-0002' then raise exception 'L0-22 report numbers are not sequential'; end if;
  if (select frozen_snapshot #>> '{judgment,summary}' from public.bm_vendor_annual_evaluation_revisions where id = v_rev2) <> ''
    then raise exception 'L0-22 optional narrative fields were not preserved as blanks'; end if;

  -- A vendor with no data has nothing to score.
  perform public.save_bm_vendor_annual_evaluation_draft(v_admin, public.create_bm_vendor_annual_evaluation_draft(v_admin, v_vendor2, v_fy),
    '{"summary":"a","strengths":"b","risksConcerns":"c","recommendations":"d","evaluatorId":"00000000-0000-0000-0000-000000000001","reviewerId":"00000000-0000-0000-0000-000000000001","approverId":"00000000-0000-0000-0000-000000000001"}'::jsonb);
  perform pg_temp.expect_err(format('select public.finalize_bm_vendor_annual_evaluation(%L, (select r.id from public.bm_vendor_annual_evaluation_revisions r join public.bm_vendor_annual_evaluations e on e.id = r.evaluation_id where e.vendor_id = %L))', v_admin, v_vendor2), 'BM_ANNUAL_COVERAGE_LOW');

  -- The Stock1 scaffolding is gone, and the fiscal year turns over on 1 October.
  if to_regclass('public.bm_vendor_evaluations') is not null or to_regclass('public.bm_vendor_eval_policies') is not null then raise exception 'L0-22 retired evaluation tables still exist'; end if;
  if public.bm_fiscal_year_be(date '2026-09-30') <> 2569 or public.bm_fiscal_year_be(date '2026-10-01') <> 2570 then raise exception 'L0-22 fiscal year turnover is wrong'; end if;

  update public.bm_receiving_policies set is_enabled = v_orig_enabled, expiry_exception_enabled = v_orig_exception where version = (select max(version) from public.bm_receiving_policies);
  raise notice 'L0-22 VENDOR EVALUATION PASS: master data, short close, event numbers, assessment rules, issues, policy, signers and annual report verified.';
end $$;
