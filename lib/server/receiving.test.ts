import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/receiving.ts'), 'utf8')

describe('receiving server TOR boundary', () => {
  it('recomputes date-only TOR compliance and remaining shelf life before the RPC', () => {
    expect(source).toContain("import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'")
    expect(source).toContain('const compliance = torExpiryCompliance(expiry, received)')
    expect(source).toContain('remainingShelfLife(expiry, received)')
    expect(source).toContain('ข้อมูล TOR ในรายการรับเข้าไม่ตรงกับการคำนวณจากวันรับและวันหมดอายุ')
  })

  it('enforces the unresolved P-01/P-02 exception gate independently of navigation', () => {
    expect(source).toContain('const EXPIRY_EXCEPTION_PENDING_MESSAGE')
    expect(source).toContain('if (compliance === \'not_compliant\' && !policy.expiryExceptionEnabled)')
    expect(source).toContain('admin.rpc(\'confirm_bm_receipt\'')
  })
})
