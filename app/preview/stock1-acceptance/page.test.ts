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

  it('uses the real Phase 2 components with browser-only fixture resolvers', () => {
    expect(component).toContain('InvoiceImageCrop')
    expect(component).toContain('InvoiceOcr')
    expect(component).toContain('PackageScan')
    expect(component).toContain('previewOnly')
    expect(component).toContain('resolvePreviewPackage')
    expect(component).toContain('matchKnownLots')
    expect(component).not.toContain("'/api/receiving")
    expect(component).not.toContain('fetch(')
    expect(component).not.toContain('supabase')
    expect(component).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
  })
})
