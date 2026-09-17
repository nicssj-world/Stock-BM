import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202606120001_bm_stock_v1.sql'), 'utf8')

describe('legacy BM stock receive function', () => {
  it('preserves the existing RPC signature, lot uniqueness, and expiry validation', () => {
    expect(sql).toContain('create or replace function public.receive_bm_stock(')
    expect(sql).toContain('p_item uuid')
    expect(sql).toContain('p_lot_number text')
    expect(sql).toContain('p_expiry_date date')
    expect(sql).toContain('unique (item_id, lot_number)')
    expect(sql).toContain("if v_lot.expiry_date is distinct from v_expiry_date then")
    expect(sql).toContain("raise exception 'Existing lot expiry date does not match'")
  })

  it('keeps the receive operation on the existing append-only ledger', () => {
    expect(sql).toContain("insert into public.bm_stock_transactions(")
    expect(sql).toContain("transaction_type, reference_text, note, created_by")
    expect(sql).toContain("values (v_transaction, v_lot.id, p_location, p_quantity)")
    expect(sql).toContain('insert into public.bm_stock_movement_lines(transaction_id, lot_id, location_id, quantity)')
    expect(sql).toContain('grant execute on function public.receive_bm_stock(')
  })
})
