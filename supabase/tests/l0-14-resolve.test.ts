import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { resolveScan } from '@/lib/server/stock'

describe('L0-14 real barcode resolution', () => {
  it.skipIf(process.env.STOCK_DB_HARNESS !== '1')('returns ambiguous with every matching item candidate', async () => {

    const result = await resolveScan('AMBIGUOUS-GTIN-001')
    expect(result.kind).toBe('ambiguous')
    expect(result.candidates).toHaveLength(2)
    expect(new Set(result.candidates?.map((candidate) => candidate.itemId))).toEqual(new Set([
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
    ]))
    console.log('L0-14 PASS: resolveScan returns ambiguous with every matching item candidate.')
  })
})
