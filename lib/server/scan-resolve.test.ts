import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/stock.ts'), 'utf8')
const types = readFileSync(join(process.cwd(), 'lib/bm/types.ts'), 'utf8')

describe('barcode scan resolution', () => {
  it('queries the additive barcode tables with select so duplicates can become ambiguous', () => {
    expect(source).toContain("from('bm_stock_lot_barcodes').select('stock_lot_id')")
    expect(source).toContain("from('bm_stock_item_barcodes').select('stock_item_id')")
    expect(source).not.toContain("from('bm_stock_lot_barcodes').maybeSingle()")
    expect(source).not.toContain("from('bm_stock_item_barcodes').maybeSingle()")
  })

  it('exposes an ambiguous outcome carrying all candidate identities', () => {
    expect(types).toContain("'ambiguous'")
    expect(types).toContain('candidates')
    expect(source).toContain("kind: 'ambiguous'")
    expect(source).toContain('const candidates')
  })

  it('keeps legacy scan callers on the existing resolve endpoint', () => {
    expect(source).toContain('export async function resolveScan(codeInput: string): Promise<ScanResolution>')
    expect(readFileSync(join(process.cwd(), 'app/api/scan/resolve/route.ts'), 'utf8')).toContain('resolveScan(')
    expect(readFileSync(join(process.cwd(), 'components/scan-view.tsx'), 'utf8')).toContain('ScanResolution')
  })
})
