import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/invoice-ocr.tsx'), 'utf8')

describe('invoice OCR intake UI', () => {
  it('accepts only the confirmed processed image and provides progress/cancel controls', () => {
    expect(source).toContain('processedImage')
    expect(source).toContain('recognizeProcessedInvoiceImage')
    expect(source).toContain('AbortController')
    expect(source).toContain('ยกเลิก OCR')
    expect(source).toContain('อ่านข้อความเสร็จแล้ว')
  })

  it('shows raw text and the four match outcomes before creating an OCR draft', () => {
    expect(source).toContain('buildInvoiceOcrDraftLines')
    expect(source).toContain('exact_unique')
    expect(source).toContain('exact_ambiguous')
    expect(source).toContain('similar')
    expect(source).toContain('unmatched')
    expect(source).toContain('/api/receiving/ocr/jobs')
    expect(source).toContain('FormData')
  })

  it('does not call a stock mutation or submit the original image', () => {
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
    expect(source).not.toContain('originalImage')
  })
})
