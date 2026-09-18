import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/invoice-image-crop.tsx'), 'utf8')

describe('invoice image crop capture boundary', () => {
  it('keeps original, editable corners, and processed image as separate workflow states', () => {
    expect(source).toContain('originalImage')
    expect(source).toContain('cropCorners')
    expect(source).toContain('processedImage')
    expect(source).toContain('setPointerCapture')
    expect(source).toContain('onPointerMove')
    expect(source).toContain('rectifyPerspectiveImage')
  })

  it('requires explicit crop/skip confirmation and supports reset, original preview, and replacement', () => {
    expect(source).toContain('ใช้ Auto Crop / Reset corners')
    expect(source).toContain('Original image')
    expect(source).toContain('Retake / Choose another image')
    expect(source).toContain('Skip Crop')
    expect(source).toContain('Confirm Crop')
    expect(source).toContain('onConfirmed')
  })

  it('does not contain a stock mutation or direct OCR shortcut', () => {
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
    expect(source).not.toContain('tesseract')
  })
})
