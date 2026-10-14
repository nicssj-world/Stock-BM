import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/api/receiving/scan/parse/route.ts'), 'utf8')

describe('package scan parse route', () => {
  it('is flag-gated, parses before lookup, and queries the additive item barcode table', () => {
    expect(source).toContain('requireStockOperator')
    expect(source).toContain('assertReceivingEnabled')
    expect(source).toContain('parseBarcode(')
    expect(source).toContain("from('bm_stock_item_barcodes')")
    expect(source).toContain('matchPackageBarcode(')
  })

  it('falls back to a confirmed Item Master catalog value from AI 240 without creating a new REF', () => {
    expect(source).toContain("from('bm_stock_items')")
    expect(source).toContain(".eq('catalog_no_normalized', catalog)")
    expect(source).toContain("source = 'ai240_catalog'")
    expect(source).toContain('!candidates.length && parsed.additionalProductId')
  })

  it('has no stock mutation or ledger call', () => {
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/)
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock/)
  })
})
