import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(join(process.cwd(), 'app/preview/stock1-acceptance/page.tsx'), 'utf8')
const component = readFileSync(join(process.cwd(), 'components/receiving/stock1-preview-acceptance.tsx'), 'utf8')

describe('Stock1 Preview acceptance route', () => {
  it('is fail-closed outside Preview with the explicit acceptance flag', () => {
    expect(page).toContain("process.env.STOCK1_PREVIEW_ACCEPTANCE_MODE === 'true'")
    expect(page).toContain("process.env.VERCEL_ENV === 'preview'")
    expect(page).not.toContain("process.env.NODE_ENV === 'development'")
    expect(page).toContain('notFound()')
  })

  it('demonstrates the final workflow with the real production components', () => {
    expect(component).toContain('<ReceiveWizard')
    expect(component).toContain('<ReceiptAssessmentDialog')
    expect(component).toContain('<VendorMetricsPanel')
    expect(component).toContain('Vendor Registry')
    expect(component).toContain('Annual Vendor Evaluation')
    expect(component).toContain('resolvePreviewPackage')
    expect(component).toContain('SIMULATED CONFIRM')
  })

  it('has zero production mutation paths', () => {
    expect(component).not.toContain("'/api/")
    expect(component).not.toContain('fetch(')
    expect(component).not.toMatch(/@supabase|createClient|getAdminClient|supabase\./)
    expect(component).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|confirm_bm_receipt|\.rpc\(/)
  })

  it('no longer demonstrates OCR, auto document detection or four-corner perspective crop', () => {
    expect(component).not.toMatch(/ocr|tesseract|perspective|four-corner|auto-detect|detectDocument/i)
  })

  it('shows no vendor score while P-13/P-14 are unapproved', () => {
    expect(component).toContain('ยังไม่ได้กำหนดสูตรคะแนน')
    expect(component).not.toMatch(/\bscore\s*[:=]|weights?\s*[:=]/i)
  })
})
