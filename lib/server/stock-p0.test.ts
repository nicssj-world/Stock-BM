import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stockSource = readFileSync(join(process.cwd(), 'lib/server/stock.ts'), 'utf8')
const authSource = readFileSync(join(process.cwd(), 'lib/server/auth.ts'), 'utf8')

describe('stock P0 safeguards', () => {
  it('reads balances from the complete aggregate rather than a capped movement query', () => {
    expect(stockSource).toContain("admin.from('bm_stock_lot_location_balances').select('lot_id,location_id,on_hand')")
    expect(stockSource).not.toContain("admin.from('bm_stock_movement_lines').select('*').order('created_at', { ascending: false }).limit(2000)")
    expect(stockSource).toContain('number(balance.on_hand)')
  })

  it('provides a stock-specific server-side role guard', () => {
    expect(authSource).toContain('export async function requireStockOperator()')
    expect(authSource).toContain("actor.role === 'Assistant'")
  })
})
