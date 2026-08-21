import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202608210001_stock_lot_correction.sql'), 'utf8')

describe('stock lot correction migration', () => {
  it('updates the stable lot source with admin-only validation', () => {
    expect(sql).toContain('create or replace function public.update_bm_stock_lot')
    expect(sql).toContain("if v_role <> 'Admin' then raise exception 'Admin permission required for lot correction'")
    expect(sql).toContain('where id = p_lot\n  for update')
    expect(sql).toContain('set lot_number = v_lot_number,\n      expiry_date = p_expiry_date')
  })

  it('preserves the ledger and records before/after audit data', () => {
    expect(sql).toContain("'stock.lot.update'")
    expect(sql).toContain("'before', jsonb_build_object('lotNumber', v_old_lot_number, 'expiryDate', v_old_expiry_date)")
    expect(sql).toContain("'after', jsonb_build_object('lotNumber', v_lot_number, 'expiryDate', p_expiry_date)")
    expect(sql).toContain('revoke all on function public.update_bm_stock_lot(uuid, text, date, text, uuid) from public, anon, authenticated')
  })

  it('synchronizes linked copied labels in IQC', () => {
    expect(sql).toContain('update public.iqc_control_lots')
    expect(sql).toContain('update public.iqc_run_consumables')
    expect(sql).toContain("'linkedControlLotCount', v_control_lot_count")
    expect(sql).toContain("'linkedConsumableCount', v_consumable_count")
  })
})
