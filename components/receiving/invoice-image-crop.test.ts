import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/invoice-image-crop.tsx'), 'utf8')

describe('invoice image crop capture boundary', () => {
  it('exposes separate native Photo Library and camera inputs for iPhone Safari', () => {
    expect(source).toContain('htmlFor="invoice-image-library"')
    expect(source).toContain('htmlFor="invoice-image-camera"')
    expect(source).toContain('id="invoice-image-library"')
    expect(source).toContain('id="invoice-image-camera"')
    expect(source).toContain('เลือกรูปจากคลังภาพ')
    expect(source).toContain('ถ่ายรูปใหม่')
    const libraryInput = source.match(/<input id="invoice-image-library"[^>]*\/>/)?.[0] ?? ''
    const cameraInput = source.match(/<input id="invoice-image-camera"[^>]*\/>/)?.[0] ?? ''
    expect(libraryInput).toContain('type="file"')
    expect(libraryInput).toContain('accept="image/*"')
    expect(libraryInput).not.toContain('capture=')
    expect(cameraInput).toContain('type="file"')
    expect(cameraInput).toContain('accept="image/*"')
    expect(cameraInput).toContain('capture="environment"')
  })

  it('uses label activation and does not defer the native picker behind ref clicks or hidden inputs', () => {
    expect(source).toContain('<label htmlFor="invoice-image-library"')
    expect(source).toContain('<label htmlFor="invoice-image-camera"')
    expect(source).not.toContain('inputRef.current?.click()')
    expect(source).not.toContain('className="hidden"')
    expect(source).not.toMatch(/<input[^>]*pointer-events-none/)
  })

  it('keeps a canceled file selection as a no-op while selected files enter the existing crop pipeline', () => {
    expect(source).toMatch(/function handleFileSelection\([^)]*\)[\s\S]*?const file = event\.currentTarget\.files\?\.\[0\] \?\? null[\s\S]*?if \(!file\) return[\s\S]*?chooseImage\(file\)/)
    expect(source).toContain('setOriginalImage(image)')
    expect(source).toContain('detectDocumentCorners(image)')
    expect(source).toContain('onConfirmed?.({ originalImage, cropCorners, processedImage: rectified.dataUrl, skipped: false })')
    expect(source).toContain("style={{ imageOrientation: 'from-image' }}")
  })

  it('accepts browser-supplied HEIC and HEIF image files without narrowing the image MIME type', () => {
    expect(source).toContain("file.type.toLowerCase().startsWith('image/')")
    expect(source).toContain("/\\.(?:heic|heif)$/i.test(file.name)")
  })

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
    expect(source).toContain('เลือกรูปจากคลังภาพ')
    expect(source).toContain('ถ่ายรูปใหม่')
    expect(source).toContain('Skip Crop')
    expect(source).toContain('Confirm Crop')
    expect(source).toContain('onConfirmed')
  })

  it('does not contain a stock mutation or direct OCR shortcut', () => {
    expect(source).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
    expect(source).not.toContain('tesseract')
  })
})
