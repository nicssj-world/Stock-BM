import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260723200000_stock_p0_integrity.sql'), 'utf8')

describe('stock P0 integrity migration', () => {
  it('creates a complete, service-only balance aggregate', () => {
    expect(sql).toContain('create or replace view public.bm_stock_lot_location_balances')
    expect(sql).toContain('with (security_invoker = true)')
    expect(sql).toContain('coalesce(sum(quantity), 0)::numeric as on_hand')
    expect(sql).toContain('revoke all on table public.bm_stock_lot_location_balances from public, anon, authenticated')
    expect(sql).toContain('grant select on table public.bm_stock_lot_location_balances to service_role')
  })

  it('locks affected lots before balance-changing checks', () => {
    expect(sql).toContain('select * into v_lot from public.bm_stock_lots where id = p_lot for update')
    expect(sql).toContain('order by id\n  for update')
    expect(sql).toContain('select distinct lot_id\n    from jsonb_to_recordset(p_lines)')
    expect(sql).toContain('perform 1 from public.bm_stock_lots where id = v_line.lot_id for update')
  })

  it('checks the total quantity for duplicate issue bundle lines', () => {
    expect(sql).toContain('group by lot_id, location_id')
    expect(sql).toContain('having sum(quantity) > public.bm_lot_location_balance(lot_id, location_id)')
  })
})
