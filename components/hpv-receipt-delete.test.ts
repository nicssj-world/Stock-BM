import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const service = readFileSync(join(process.cwd(), 'lib/server/hpv.ts'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/hpv/receipts/[id]/route.ts'), 'utf8')
const view = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV receive log deletion', () => {
  it('deletes only through an admin-protected route with a reason', () => {
    expect(route).toContain('export async function DELETE')
    expect(route).toContain('requireStockAdmin()')
    expect(route).toContain('deleteSchema')
    expect(service).toContain('export async function deleteHpvReceipt')
    expect(service).toContain(".from('bm_hpv_site_receipts').delete().eq('id', id)")
    expect(service).toContain("'hpv.receipt.delete'")
  })

  it('exposes a confirmed delete action in Receive Log', () => {
    expect(view).toContain("method: 'DELETE'")
    expect(view).toContain('ลบ Receive Log')
    expect(view).toContain('<Trash2 className="size-3" />')
  })
})
