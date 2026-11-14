import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Normalize line endings: Windows checkouts (core.autocrlf) turn LF into CRLF.
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180006_bm_receiving_functions.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('receiving function migration', () => {
  it('mirrors the global six-calendar-month TOR rule with a strict greater-than boundary', () => {
    expect(sql).toContain('create or replace function public.bm_add_calendar_months')
    expect(sql).toContain('make_interval(months => p_months)')
    expect(sql).toContain('create or replace function public.bm_tor_expiry_compliance')
    expect(sql).toContain("p_expiry > public.bm_add_calendar_months(p_received, p_months)")
    expect(sql).toContain('v_remaining_shelf_life_days := case when v_expiry is null then null else v_expiry - v_receipt.received_date end')
    expect(sql).toContain("'not_applicable'")
    expect(sql).toContain("'not_compliant'")
  })

  it('uses deterministic pre-locking and the required concurrency-safe lot resolution', () => {
    expect(sql).toContain('perform 1\n  from public.bm_stock_lots\n  where id in (select stock_lot_id from public.bm_receipt_lines')
    expect(sql).toContain('order by id\n  for update')
    expect(sql).toContain('on conflict (item_id, lot_number) do nothing')
    expect(sql).toContain('where item_id = v_item.id and lot_number = v_lot_number\n    for update')
    expect(sql).toContain("raise exception 'Existing lot expiry date does not match'")
  })

  it('delegates every ledger write to the untouched bundle RPC and enforces both gates', () => {
    expect(sql).toContain('public.assert_bm_stock_actor(p_actor)')
    expect(sql).toContain("if not v_policy.is_enabled then raise exception 'Receiving workflow is not enabled'")
    expect(sql).toContain("if v_compliance = 'not_compliant' then")
    expect(sql).toContain("if not v_policy.expiry_exception_enabled then")
    expect(sql).toContain("raise exception 'Expiry exception acceptance is not enabled (pending policy approval)'")
    expect(sql).toContain('public.receive_bm_stock_bundle(')
    expect(sql).not.toContain('insert into public.bm_stock_movement_lines')
    expect(sql).not.toContain('manufacturer_barcode')
    expect(sql).not.toContain('update public.bm_stock_lots set expiry_date')
  })

  it('records expiry exceptions with the named evidence fields and grants only service_role', () => {
    expect(sql).toContain("'receiving.expiry.exception'")
    for (const field of ['receipt_id', 'receipt_line_id', 'invoice_id', 'vendor_id', 'stock_item_id', 'stock_lot_id', 'expiry_date', 'received_date', 'tor_threshold_months', 'remaining_shelf_life_days', 'reason_code', 'reason_note', 'accepted_by', 'accepted_at']) {
      expect(sql).toContain(field)
    }
    expect(sql).toContain('revoke all on function public.confirm_bm_receipt(uuid, uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.confirm_bm_receipt(uuid, uuid) to service_role')
  })
})
