import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/(protected)/receiving/receipts/[id]/report/page.tsx'), 'utf8')

describe('receiving receipt report', () => {
  it('uses the dedicated Thai print page pattern and names the output', () => {
    expect(source).toContain('export async function generateMetadata')
    expect(source).toContain('Stock-Receipt-')
    expect(source).toContain('<PrintButton />')
    expect(source).toContain('formatThaiDate(')
    expect(source).toContain('formatThaiDateTime(')
    expect(source).not.toContain("lib/reports/pdf")
  })

  it('renders stock receipt and line evidence from the existing attachment service', () => {
    expect(source).toContain("listAttachments('stock', 'stock-receipt'")
    expect(source).toContain("listAttachments('stock', 'stock-receipt-line'")
    expect(source).toContain('หลักฐานใบรับเข้า')
    expect(source).toContain('หลักฐานรายการ')
  })
})
