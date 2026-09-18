import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/scan-text-field.tsx'), 'utf8')

describe('scan-to-fill text field', () => {
  it('uses the shared camera scanner and stops after a single scan', () => {
    expect(source).toContain('useCameraScanner')
    expect(source).toContain('stopOnScan: true')
    expect(source).toContain('onChange(code)')
  })

  it('supports typing as well as scanning, and never parses the value as GS1/HIBC package data', () => {
    expect(source).toContain('<Input value={value} onChange={(event) => onChange(event.target.value)}')
    expect(source).not.toMatch(/parseBarcode|matchPackageBarcode/)
  })

  it('contains no stock mutation shortcut', () => {
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(|fetch\(|api\(/)
  })
})
