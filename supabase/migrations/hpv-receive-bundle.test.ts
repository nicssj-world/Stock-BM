import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607090004_hpv_kit_returns.sql'), 'utf8')

describe('legacy HPV receive bundle path', () => {
  it('preserves the existing bundle RPC and its append-only movement writes', () => {
    expect(sql).toContain('create or replace function public.receive_bm_stock_bundle(')
    expect(sql).toContain('p_lines jsonb')
    expect(sql).toContain("jsonb_to_recordset(p_lines) as x(lot_id uuid, location_id uuid, quantity numeric)")
    expect(sql).toContain("insert into public.bm_stock_transactions(transaction_type, reference_text, note, created_by)")
    expect(sql).toContain("insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)")
    expect(sql).toContain('grant execute on function public.receive_bm_stock_bundle(jsonb, text, text, uuid) to service_role')
  })

  it('keeps HPV returns linked to the existing bundle receive function', () => {
    expect(sql).toContain('create or replace function public.return_hpv_kit_bundle(')
    expect(sql).toContain('v_transaction := public.receive_bm_stock_bundle(')
    expect(sql).toContain('stock_transaction_id, note, created_by')
    expect(sql).toContain('stock_lot_id, stock_location_id, quantity')
    expect(sql).toContain('grant execute on function public.return_hpv_kit_bundle(uuid, date, jsonb, text, text, uuid) to service_role')
  })
})
