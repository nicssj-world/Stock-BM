import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const frame = readFileSync(join(process.cwd(), 'components/eqa-report-frame.tsx'), 'utf8')
const plan = readFileSync(join(process.cwd(), 'app/(protected)/eqa/report/annual-plan/[planId]/page.tsx'), 'utf8')
const receipt = readFileSync(join(process.cwd(), 'app/(protected)/eqa/report/round-receipt/[roundId]/page.tsx'), 'utf8')
const summary = readFileSync(join(process.cwd(), 'app/(protected)/eqa/report/annual-summary/[planItemId]/page.tsx'), 'utf8')
const eqaView = readFileSync(join(process.cwd(), 'components/eqa-view.tsx'), 'utf8')

describe('EQA print reports', () => {
  it('bundles TH Sarabun New and waits for font readiness', () => {
    expect(frame).toContain('font-family:"TH Sarabun New"')
    expect(frame).toContain('THSarabunNew-Regular.ttf')
    expect(readFileSync(join(process.cwd(), 'components/eqa-print-button.tsx'), 'utf8')).toContain('document.fonts.ready')
  })

  it('keeps the exact document codes at the fixed bottom-right position', () => {
    expect(frame).toContain('position:fixed;right:10mm;bottom:7mm')
    expect(plan).toContain("EQA_DOCUMENT_CODES['annual-plan']")
    expect(receipt).toContain("EQA_DOCUMENT_CODES['round-receipt']")
    expect(summary).toContain("EQA_DOCUMENT_CODES['annual-summary']")
  })

  it('uses the required paper orientations', () => {
    expect(plan).toContain('orientation="landscape"')
    expect(receipt).toContain('orientation="portrait"')
    expect(summary).toContain('orientation="portrait"')
  })

  it('shows the project and year-specific sample set in the annual plan', () => {
    expect(plan).toContain('{item.projectName}<br />{item.sampleSetName}')
    expect(plan).toContain("item.externalCode ? ` (${item.externalCode})` : ''")
  })

  it('deduplicates sample codes and identifies the analyte in the analyst review', () => {
    expect(receipt).toContain('const sampleCodes = [...new Set(')
    expect(receipt).toContain("{result.sampleCode ?? '-'}&nbsp;&nbsp;·&nbsp;&nbsp;{result.analyte}")
  })

  it('keeps the review-table column divider continuous through its headings', () => {
    expect(receipt).toContain('className="review-heading"')
    expect(receipt).toContain('.review-heading>div{border-left:1px solid #111}')
  })

  it('deduplicates annual-summary sample codes and prints each result with its analyte', () => {
    expect(summary).toContain('function uniqueSampleCodes')
    expect(summary).toContain('function resultLabels')
    expect(summary).toContain('รายการทดสอบ: {resultLabels(round.results).join')
  })

  it('keeps each annual-summary report compact until its approval details are opened', () => {
    expect(eqaView).toContain('const [expanded, setExpanded] = useState(false)')
    expect(eqaView).toContain("expanded ? 'ซ่อนรายละเอียด' : 'ตรวจ/อนุมัติ'")
    expect(eqaView).toContain('รอดำเนินการ ${readiness.length} รายการ')
  })
})
