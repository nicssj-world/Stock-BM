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

  it('never lets a missing bm_stock_item_vendors table take down the shared stock workspace loader', () => {
    // getStockWorkspace() backs Dashboard/Admin/Inventory/Movements/Reports —
    // none of which are about vendors. A migration-timing gap on this later,
    // optional link table must degrade to "no vendor links", not crash every
    // one of those pre-existing pages the way an unguarded fail() would.
    const workspaceFn = stock.slice(stock.indexOf('export async function getStockWorkspace'), stock.indexOf('export async function getStockWorkspace') + 4000)
    expect(workspaceFn).toContain('itemVendorLinkError ? [] : ')
    expect(workspaceFn).not.toContain('fail(itemVendorLinkError)')
    // The other, non-optional queries in the same loader must still fail loudly.
    expect(workspaceFn).toContain('fail(itemError)')
    expect(workspaceFn).toContain('fail(lotError)')
    expect(workspaceFn).toContain('fail(balanceError)')
  })
})
