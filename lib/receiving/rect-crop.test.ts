import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { orientationSwapsAxes, readJpegOrientation } from './image-orientation'
import { containRect, cropRectToPixels, dragCropRect, FULL_CROP_RECT, isFullCrop, isSupportedInvoiceImage, MIN_CROP_FRACTION, normalizeCropRect, scaledSize } from './rect-crop'

/** Minimal JPEG: SOI + APP1/Exif with one IFD0 entry (Orientation), then EOI. */
function jpegWithOrientation(orientation: number, littleEndian = false) {
  const u16 = (value: number) => littleEndian ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]
  const u32 = (value: number) => littleEndian ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24] : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
  const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)]
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...u16(app1.length + 2), ...app1, 0xff, 0xd9])
}

describe('rectangular invoice crop', () => {
  it('starts from and resets to the full image', () => {
    expect(FULL_CROP_RECT).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(isFullCrop(FULL_CROP_RECT)).toBe(true)
  })

  it('pans the rectangle without leaving the image', () => {
    const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }
    expect(dragCropRect(start, 'move', 0.1, -0.05)).toEqual({ x: 0.30000000000000004, y: 0.15000000000000002, width: 0.5, height: 0.5 })
    expect(dragCropRect(start, 'move', 5, 5)).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 })
    expect(dragCropRect(start, 'move', -5, -5)).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 })
  })

  it('resizes from a corner while the opposite corner stays fixed', () => {
    const resized = dragCropRect(FULL_CROP_RECT, 'nw', 0.1, 0.2)
    expect(resized.x).toBeCloseTo(0.1)
    expect(resized.y).toBeCloseTo(0.2)
    expect(resized.x + resized.width).toBeCloseTo(1)
    expect(resized.y + resized.height).toBeCloseTo(1)
    const se = dragCropRect(FULL_CROP_RECT, 'se', -0.25, -0.5)
    expect(se).toMatchObject({ x: 0, y: 0 })
    expect(se.width).toBeCloseTo(0.75)
    expect(se.height).toBeCloseTo(0.5)
  })

  it('never collapses below the minimum size or inverts', () => {
    const collapsed = dragCropRect(FULL_CROP_RECT, 'ne', -2, 2)
    expect(collapsed.width).toBeCloseTo(MIN_CROP_FRACTION)
    expect(collapsed.height).toBeCloseTo(MIN_CROP_FRACTION)
    expect(normalizeCropRect({ x: Number.NaN, y: -1, width: 3, height: 0 }).width).toBe(1)
  })

  it('maps the normalized crop to whole source pixels inside the image', () => {
    expect(cropRectToPixels({ x: 0.1, y: 0.25, width: 0.5, height: 0.5 }, 2400, 1800)).toEqual({ x: 240, y: 450, width: 1200, height: 900 })
    const edge = cropRectToPixels({ x: 0.9999, y: 0.9999, width: 0.5, height: 0.5 }, 100, 100)
    expect(edge.x + edge.width).toBeLessThanOrEqual(100)
    expect(edge.y + edge.height).toBeLessThanOrEqual(100)
  })

  it('fits the image in the frame and downscales large phone photos', () => {
    expect(containRect(400, 300, 3000, 4000)).toEqual({ left: 87.5, top: 0, width: 225, height: 300 })
    expect(scaledSize(4032, 3024, 2400)).toEqual({ width: 2400, height: 1800 })
    expect(scaledSize(800, 600, 2400)).toEqual({ width: 800, height: 600 })
  })

  it('accepts iPhone library and camera formats', () => {
    expect(isSupportedInvoiceImage({ type: 'image/jpeg', name: 'IMG_0001.JPG' })).toBe(true)
    expect(isSupportedInvoiceImage({ type: '', name: 'IMG_0002.HEIC' })).toBe(true)
    expect(isSupportedInvoiceImage({ type: 'application/pdf', name: 'invoice.pdf' })).toBe(false)
  })
})

describe('EXIF orientation', () => {
  it('reads the Orientation tag from big- and little-endian EXIF', () => {
    expect(readJpegOrientation(jpegWithOrientation(6))).toBe(6)
    expect(readJpegOrientation(jpegWithOrientation(3, true))).toBe(3)
    expect(orientationSwapsAxes(6)).toBe(true)
    expect(orientationSwapsAxes(3)).toBe(false)
  })

  it('returns null for non-JPEG or EXIF-less data', () => {
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
  })
})

describe('invoice image crop component', () => {
  const source = readFileSync(join(process.cwd(), 'components/receiving/invoice-image-crop.tsx'), 'utf8')

  it('offers library selection and rear-camera capture', () => {
    expect(source).toContain('เลือกรูปจากคลังภาพ')
    expect(source).toContain('ถ่ายรูปใหม่')
    expect(source).toContain('capture="environment"')
    expect(source).toContain('accept="image/*"')
  })

  it('offers Reset, Skip Crop, Confirm Crop and replacement before confirmation', () => {
    expect(source).toContain('Reset')
    expect(source).toContain('Skip Crop')
    expect(source).toContain('Confirm Crop')
    expect(source).toContain('แทนที่รูปเดิม')
  })

  it('decodes upright (EXIF applied once) and renders the working copy without re-rotation', () => {
    expect(source).toContain("image.style.imageOrientation = 'from-image'")
    expect(source).toContain("imageOrientation: 'none'")
    expect(source).toContain('readJpegOrientation(')
  })

  it('is a plain rectangular crop: touch-friendly, no perspective, detection or CV code', () => {
    expect(source).toContain('onPointerDown')
    expect(source).toContain('touch-none')
    expect(source).toContain('size-11')
    expect(source).not.toMatch(/perspective|detectDocument|quadrilateral|loupe|opencv|cv\./i)
  })

  it('is evidence only and never derives receipt data from the image', () => {
    expect(source).toContain('หลักฐานเท่านั้น')
    expect(source).not.toMatch(/fetch\(|api\(|stockItemId|receivedQty|vendorId/)
  })
})
