import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const server = readFileSync(join(process.cwd(), 'lib/server/receiving.ts'), 'utf8')
const page = readFileSync(join(process.cwd(), 'app/(protected)/receiving/page.tsx'), 'utf8')
const layout = readFileSync(join(process.cwd(), 'app/(protected)/layout.tsx'), 'utf8')
const shell = readFileSync(join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

describe('receiving feature flag enforcement', () => {
  it('checks the policy in the page and server module, not only in navigation', () => {
    expect(server).toContain('export async function assertReceivingEnabled')
    expect(server).toContain("if (!policy.isEnabled) throw new HttpError(404, 'Not found')")
    expect(page).toContain('assertReceivingEnabled')
    expect(page).toContain('notFound')
    expect(layout).toContain('getReceivingNavEnabled')
    expect(shell).toContain('receivingEnabled')
    expect(proxy).toContain("'/receiving/:path*'")
  })

  it('keeps expiry exception disabled independently with the governed Thai message', () => {
    expect(server).toContain('expiryExceptionEnabled')
    expect(server).toContain('ยังไม่เปิดใช้งานการรับสินค้าที่ไม่ผ่านเกณฑ์ TOR — รออนุมัติผู้มีสิทธิ์ (P-01/P-02)')
    expect(server).toContain("rpc('confirm_bm_receipt'")
  })
})
