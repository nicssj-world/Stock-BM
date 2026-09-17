import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stockService = readFileSync(join(process.cwd(), 'lib/server/stock.ts'), 'utf8')
const receiptRoute = readFileSync(join(process.cwd(), 'app/api/stock/receipts/route.ts'), 'utf8')
const transactionView = readFileSync(join(process.cwd(), 'components/transaction-view.tsx'), 'utf8')

describe('legacy stock receive path', () => {
  it('keeps the server receive service on the existing receive_bm_stock RPC', () => {
    expect(stockService).toContain('export async function receiveStock(')
    expect(stockService).toContain("getAdminClient().rpc('receive_bm_stock', {")
    expect(stockService).toContain('p_item: input.itemId')
    expect(stockService).toContain('p_lot_number: clean(input.lotNumber)')
    expect(stockService).toContain('p_expiry_date: input.expiryDate || null')
    expect(stockService).toContain('p_quantity: input.quantity')
    expect(stockService).toContain('p_location: input.locationId')
    expect(stockService).toContain('p_manufacturer_barcode: clean(input.manufacturerBarcode)')
    expect(stockService).toContain('p_actor: actor.id')
  })

  it('keeps the existing protected API route and ReceiveForm submission', () => {
    expect(receiptRoute).toContain('export async function POST')
    expect(receiptRoute).toContain('receiveStock(')
    expect(transactionView).toContain('function ReceiveForm(')
    expect(transactionView).toContain("'/api/stock/receipts'")
    expect(transactionView).toContain("method: 'POST'")
  })
})
