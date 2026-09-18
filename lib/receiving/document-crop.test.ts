import { describe, expect, it } from 'vitest'
import {
  applyPerspectiveTransform,
  buildPerspectiveTransform,
  detectDocumentCornersFromRgba,
  displayToImagePoint,
  imageToDisplayPoint,
  normalizeExifPoint,
  orientedImageSize,
  orderCorners,
  resetCropCorners,
  validatePerspectiveInput,
} from './document-crop'

function rgba(width: number, height: number, fill: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = fill(x, y)
      const offset = (y * width + x) * 4
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  }
  return data
}

describe('document crop geometry', () => {
  it('maps display coordinates to original image pixels and back', () => {
    const image = { width: 1200, height: 800 }
    const display = { width: 300, height: 200 }
    expect(displayToImagePoint({ x: 150, y: 100 }, display, image)).toEqual({ x: 600, y: 400 })
    expect(imageToDisplayPoint({ x: 600, y: 400 }, image, display)).toEqual({ x: 150, y: 100 })
  })

  it('orders four corners consistently from arbitrary input order', () => {
    expect(orderCorners([
      { x: 0.9, y: 0.8 },
      { x: 0.1, y: 0.2 },
      { x: 0.1, y: 0.8 },
      { x: 0.9, y: 0.2 },
    ])).toEqual({
      topLeft: { x: 0.1, y: 0.2 },
      topRight: { x: 0.9, y: 0.2 },
      bottomRight: { x: 0.9, y: 0.8 },
      bottomLeft: { x: 0.1, y: 0.8 },
    })
  })

  it('resets to detected corners or a safe manual rectangle', () => {
    const detected = {
      topLeft: { x: 0.2, y: 0.1 },
      topRight: { x: 0.8, y: 0.15 },
      bottomRight: { x: 0.85, y: 0.9 },
      bottomLeft: { x: 0.15, y: 0.85 },
    }
    expect(resetCropCorners(detected)).toEqual(detected)
    expect(resetCropCorners(null)).toEqual({
      topLeft: { x: 0.04, y: 0.04 },
      topRight: { x: 0.96, y: 0.04 },
      bottomRight: { x: 0.96, y: 0.96 },
      bottomLeft: { x: 0.04, y: 0.96 },
    })
  })

  it('validates perspective input and rejects degenerate corners', () => {
    const valid = resetCropCorners(null)
    expect(validatePerspectiveInput(valid, { width: 1200, height: 800 }).ok).toBe(true)
    expect(buildPerspectiveTransform(valid, { width: 1200, height: 800 })).not.toBeNull()

    const invalid = { ...valid, bottomLeft: valid.topLeft }
    expect(validatePerspectiveInput(invalid, { width: 1200, height: 800 }).ok).toBe(false)
    expect(buildPerspectiveTransform(invalid, { width: 1200, height: 800 })).toBeNull()
  })

  it('maps the rectified output corners back to the selected source quadrilateral', () => {
    const corners = {
      topLeft: { x: 0.1, y: 0.2 },
      topRight: { x: 0.85, y: 0.1 },
      bottomRight: { x: 0.9, y: 0.8 },
      bottomLeft: { x: 0.15, y: 0.9 },
    }
    const input = { width: 1000, height: 800 }
    const output = { width: 760, height: 700 }
    const transform = buildPerspectiveTransform(corners, input, output)
    expect(transform).not.toBeNull()
    expect(applyPerspectiveTransform(transform!, { x: 0, y: 0 })).toEqual({ x: 100, y: 160 })
    expect(applyPerspectiveTransform(transform!, { x: output.width - 1, y: 0 })?.x).toBeCloseTo(850)
    expect(applyPerspectiveTransform(transform!, { x: output.width - 1, y: 0 })?.y).toBeCloseTo(80)
    expect(applyPerspectiveTransform(transform!, { x: 0, y: output.height - 1 })?.x).toBeCloseTo(150)
    expect(applyPerspectiveTransform(transform!, { x: 0, y: output.height - 1 })?.y).toBeCloseTo(720)
  })

  it('detects a high-contrast document and falls back when no document is present', () => {
    const detected = detectDocumentCornersFromRgba(rgba(100, 100, (x, y) => x >= 18 && x <= 81 && y >= 12 && y <= 87 ? 235 : 20), 100, 100)
    expect(detected).not.toBeNull()
    expect(detected?.topLeft.x).toBeGreaterThan(0.1)
    expect(detected?.topLeft.y).toBeGreaterThan(0.05)
    expect(detectDocumentCornersFromRgba(rgba(100, 100, () => 120), 100, 100)).toBeNull()
  })

  it('keeps coordinate handling correct for rotated EXIF orientations', () => {
    expect(orientedImageSize({ width: 1200, height: 800 }, 6)).toEqual({ width: 800, height: 1200 })
    expect(normalizeExifPoint({ x: 0.2, y: 0.3 }, 6)).toEqual({ x: 0.7, y: 0.2 })
  })
})
