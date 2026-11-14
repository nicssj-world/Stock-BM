import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const reportPage = readFileSync(join(process.cwd(), 'app/(protected)/reports/stock-summary/page.tsx'), 'utf8')
const printButton = readFileSync(join(process.cwd(), 'components/print-button.tsx'), 'utf8')
const legacyEndpoint =readFileSync(join(process.cwd(), 'app/api/reports/stock-summary.pdf/route.ts'), 'utf8')

describe('stock compliance report', () => {
  it('uses a print-ready HTML report with Thai font support and actionable risk details', () => {
    // The print action lives in the shared PrintButton (waits for fonts, then window.print()).
    expect(reportPage).toContain("import { PrintButton } from '@/components/print-button'")
    expect(reportPage).toContain('<PrintButton')
    expect(printButton).toContain('Print / Save PDF')
    expect(printButton).toContain('window.print()')
    expect(reportPage).toContain('"Noto Sans Thai"')
    expect(reportPage).toContain('Lot / วันหมดอายุ')
    expect(reportPage).toContain('รายการเคลื่อนไหวล่าสุด')
  })

  it('redirects the legacy PDF endpoint to the Unicode-safe report page', () => {
    expect(legacyEndpoint).toContain("NextResponse.redirect(new URL('/reports/stock-summary', request.url))")
    expect(legacyEndpoint).not.toContain('buildStockSummaryPdf')
  })
})
