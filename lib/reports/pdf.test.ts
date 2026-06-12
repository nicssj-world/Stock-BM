import { describe, expect, it } from 'vitest'
import { buildStockSummaryPdf } from '@/lib/reports/pdf'
import type { BmActor, StockWorkspace } from '@/lib/bm/types'

describe('BM stock PDF', () => {
  it('generates a valid PDF buffer header', () => {
    const actor: BmActor = { id: 'u', ephisId: '1', displayName: 'Admin', genomicRole: 'Admin', role: 'Admin' }
    const workspace: StockWorkspace = { categories: [], locations: [], items: [], transactions: [], activeItemCount: 0, lowStockItemCount: 0, expiringLotCount: 0, expiredLotCount: 0, locationCount: 0 }
    const pdf = buildStockSummaryPdf(workspace, actor)
    expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4')
  })
})

