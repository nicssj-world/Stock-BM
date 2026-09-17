import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stock = readFileSync(join(process.cwd(), 'lib/server/stock.ts'), 'utf8')
const createRoute = readFileSync(join(process.cwd(), 'app/api/admin/items/route.ts'), 'utf8')
const updateRoute = readFileSync(join(process.cwd(), 'app/api/admin/items/[id]/route.ts'), 'utf8')

describe('item to vendor mapping', () => {
  it('uses the additive link table and the existing item update boundary', () => {
    expect(stock).toContain("from('bm_stock_item_vendors')")
    expect(stock).toContain('replaceItemVendorLinks')
    expect(createRoute).toContain('vendorIds: z.array(z.string().uuid())')
    expect(updateRoute).toContain('vendorIds: z.array(z.string().uuid())')
  })

  it('does not turn legacy supplier text into an automatic mapping', () => {
    expect(stock).toContain('if (vendorIds === undefined) return')
    expect(stock).toContain('supplier: clean(input.supplier)')
    expect(stock).not.toContain('supplier: vendor')
  })
})
