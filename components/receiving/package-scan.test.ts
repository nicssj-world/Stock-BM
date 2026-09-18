import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/package-scan.tsx'), 'utf8')

describe('package scan capture panel', () => {
  it('uses the shared scanner and the protected parse endpoint', () => {
    expect(source).toContain('useCameraScanner')
    expect(source).toContain("'/api/receiving/scan/parse'")
    expect(source).toContain('Raw payload')
    expect(source).toContain('ใช้ข้อมูลนี้')
  })

  it('contains no stock mutation shortcut', () => {
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
  })
})
