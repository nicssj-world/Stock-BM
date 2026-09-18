import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const protectedRoutes = [
  'app/api/receiving/invoices/route.ts',
  'app/api/receiving/invoices/[id]/route.ts',
  'app/api/receiving/invoices/[id]/close/route.ts',
  'app/api/receiving/invoices/[id]/lines/[lineId]/route.ts',
  'app/api/receiving/receipts/route.ts',
  'app/api/receiving/receipts/[id]/route.ts',
  'app/api/receiving/receipts/[id]/lines/route.ts',
  'app/api/receiving/receipts/[id]/lines/[lineId]/route.ts',
  'app/api/receiving/receipts/[id]/confirm/route.ts',
  'app/api/receiving/receipts/[id]/assessment/route.ts',
  'app/api/receiving/scan/parse/route.ts',
]

describe('receiving API access control', () => {
  it.each(protectedRoutes)('%s requires a stock operator', (route) => {
    const source = readFileSync(join(process.cwd(), route), 'utf8')
    expect(source).toContain('requireStockOperator')
    expect(source).not.toContain('requireActor')
  })

  it('keeps the confirm mutation inside the server receiving boundary', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/receiving/receipts/[id]/confirm/route.ts'), 'utf8')
    expect(source).toContain('confirmReceipt(')
    expect(source).not.toContain("rpc('confirm_bm_receipt'")
  })

  it('keeps invoice closure explicitly policy-gated', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/receiving/invoices/[id]/close/route.ts'), 'utf8')
    expect(source).toContain("throw new HttpError(501, 'รอการอนุมัติ policy การปิดใบส่งของ')")
  })
})
