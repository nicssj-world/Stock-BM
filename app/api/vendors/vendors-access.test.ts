import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const routes = {
  collection: readFileSync(join(process.cwd(), 'app/api/vendors/route.ts'), 'utf8'),
  item: readFileSync(join(process.cwd(), 'app/api/vendors/[id]/route.ts'), 'utf8'),
}

describe('vendor API access control', () => {
  it('lets stock operators read vendors but requires stock admin for mutations', () => {
    expect(routes.collection).toContain('requireStockOperator')
    expect(routes.collection).toContain('requireStockAdmin')
    expect(routes.collection).not.toContain('requireActor')
    expect(routes.item).toContain('requireStockAdmin')
    expect(routes.item).not.toContain('requireActor')
  })

  it('keeps vendor master independent from the receiving feature flag', () => {
    expect(routes.collection).not.toContain('isReceivingEnabled')
    expect(routes.item).not.toContain('isReceivingEnabled')
  })

  it('documents the protected-reference response and server-side admin boundary', () => {
    const server = readFileSync(join(process.cwd(), 'lib/server/vendors.ts'), 'utf8')
    expect(server).toContain("error.code === '23503'")
    expect(server).toContain('ลบ vendor ไม่ได้')
    expect(server).toContain("actor.role !== 'Admin'")
  })
})
