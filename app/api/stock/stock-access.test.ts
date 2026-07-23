import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const protectedRoutes = [
  'app/api/stock/route.ts',
  'app/api/stock/export/route.ts',
  'app/api/stock/history/route.ts',
  'app/api/stock/issue-context/route.ts',
  'app/api/stock/issues/route.ts',
  'app/api/stock/issues/batch/route.ts',
  'app/api/stock/issues/quick/route.ts',
  'app/api/stock/moves/route.ts',
  'app/api/stock/receipts/route.ts',
  'app/api/scan/resolve/route.ts',
  'app/api/dashboard/route.ts',
  'app/api/reports/stock-summary.pdf/route.ts',
]

describe('stock API access control', () => {
  it.each(protectedRoutes)('%s requires a stock operator', (route) => {
    const source = readFileSync(join(process.cwd(), route), 'utf8')

    expect(source).toContain('requireStockOperator')
    expect(source).not.toContain('requireActor')
  })
})
