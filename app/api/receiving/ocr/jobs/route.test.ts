import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(process.cwd(), 'app/api/receiving/ocr/jobs/route.ts'), 'utf8')
const server = readFileSync(join(process.cwd(), 'lib/server/receiving-ocr.ts'), 'utf8')

describe('invoice OCR draft intake boundary', () => {
  it('is a node, authenticated, flag-gated multipart route', () => {
    expect(route).toContain("export const runtime = 'nodejs'")
    expect(route).toContain('requireStockOperator')
    expect(route).toContain('formData')
    expect(server).toContain('assertReceivingEnabled')
  })

  it('stores suggestions and creates a draft invoice without receiving stock', () => {
    expect(server).toContain("source: 'ocr'")
    expect(server).toContain('bm_ocr_jobs')
    expect(server).toContain('bm_ocr_candidates')
    expect(server).toContain('descriptionText: validSelectedItem')
    expect(server).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|confirm_bm_receipt|\.rpc\(/)
    expect(route).not.toMatch(/originalImage|processedImage|image\.arrayBuffer|storage\.from/)
  })
})
