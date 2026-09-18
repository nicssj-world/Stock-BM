import { describe, expect, it } from 'vitest'
import {
  applyPerspectiveTransform,
  applyCropDrag,
  buildPerspectiveTransform,
  calculateLoupeViewportPosition,
  clampCropPoint,
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

type FixturePoint = { x: number; y: number }

function insidePolygon(x: number, y: number, points: FixturePoint[]) {
  const signs = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    return (next.x - point.x) * (y - point.y) - (next.y - point.y) * (x - point.x)
  })
  return signs.every((value) => value >= 0) || signs.every((value) => value <= 0)
}

function photoLikeFixture(width: number, height: number, documentPoints: FixturePoint[], options: { unevenLighting?: boolean; clutter?: boolean } = {}) {
  return rgba(width, height, (x, y) => {
    const lighting = options.unevenLighting ? (x / width) * 38 + (y / height) * 24 : 0
    const backgroundTexture = ((x * 17 + y * 11) % 19) - 9
    const clutter = options.clutter && (x % 19 === 0 || y % 23 === 0) ? 38 : 0
    if (!insidePolygon(x + 0.5, y + 0.5, documentPoints)) return Math.max(10, Math.round(52 + lighting * 0.45 + backgroundTexture + clutter))
    const documentTexture = ((x * 7 + y * 5) % 13) - 6
    return Math.min(245, Math.max(150, Math.round(222 - lighting + documentTexture)))
  })
}

function edgeOnlyDocumentFixture(width: number, height: number, documentPoints: FixturePoint[]) {
  function distanceToSegment(x: number, y: number, start: FixturePoint, end: FixturePoint) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared))
    return Math.hypot(x - (start.x + t * dx), y - (start.y + t * dy))
  }

  return rgba(width, height, (x, y) => {
    const background = 146 + ((x * 19 + y * 23) % 17) - 8
    const inside = insidePolygon(x + 0.5, y + 0.5, documentPoints)
    const boundary = documentPoints.some((point, index) => distanceToSegment(x + 0.5, y + 0.5, point, documentPoints[(index + 1) % documentPoints.length]) < 2.2)
    if (boundary) return 238
    if (inside) return 148 + ((x * 5 + y * 3) % 11) - 5
    return background
  })
}

describe('document crop geometry', () => {
  it('maps display coordinates to original image pixels and back', () => {
    const image = { width: 1200, height: 800 }
    const display = { width: 300, height: 200 }
    expect(displayToImagePoint({ x: 150, y: 100 }, display, image)).toEqual({ x: 600, y: 400 })
    expect(imageToDisplayPoint({ x: 600, y: 400 }, image, display)).toEqual({ x: 150, y: 100 })
  })

  it('clamps normalized crop points and keeps the loupe inside the viewport above the finger', () => {
    expect(clampCropPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 })
    expect(applyCropDrag({ x: 0.31, y: 0.42 }, { x: 0.04, y: -0.02 })).toEqual({ x: 0.35, y: expect.closeTo(0.4) })
    expect(applyCropDrag({ x: 0.02, y: 0.98 }, { x: -0.2, y: 0.3 })).toEqual({ x: 0, y: 1 })
    expect(calculateLoupeViewportPosition({ x: 195, y: 220 }, { width: 390, height: 844 })).toEqual({ left: 127, top: 66 })
    expect(calculateLoupeViewportPosition({ x: 0, y: 50 }, { width: 390, height: 844 })).toEqual({ left: 8, top: 68 })
    expect(calculateLoupeViewportPosition({ x: 389, y: 820 }, { width: 390, height: 844 })).toEqual({ left: 246, top: 666 })
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

  it('detects portrait and perspective-skewed invoice fixtures with uneven lighting and clutter', () => {
    const portrait = [
      { x: 26, y: 18 },
      { x: 98, y: 11 },
      { x: 108, y: 166 },
      { x: 17, y: 172 },
    ]
    const skewed = [
      { x: 34, y: 28 },
      { x: 194, y: 16 },
      { x: 211, y: 132 },
      { x: 18, y: 146 },
    ]
    const portraitDetected = detectDocumentCornersFromRgba(photoLikeFixture(125, 185, portrait, { unevenLighting: true, clutter: true }), 125, 185)
    const skewedDetected = detectDocumentCornersFromRgba(photoLikeFixture(230, 170, skewed, { unevenLighting: true, clutter: true }), 230, 170)
    expect(portraitDetected).not.toBeNull()
    expect(skewedDetected).not.toBeNull()
    expect(portraitDetected?.topLeft.x).toBeCloseTo(portrait[0].x / 124, 1)
    expect(portraitDetected?.topRight.x).toBeCloseTo(portrait[1].x / 124, 1)
    expect(skewedDetected?.bottomLeft.y).toBeCloseTo(skewed[3].y / 169, 1)
  })

  it('rejects a cluttered portrait background when no document quadrilateral exists', () => {
    const noDocument = rgba(160, 220, (x, y) => {
      const gradient = (x / 160) * 70 + (y / 220) * 45
      const texture = Math.sin(x / 4.7) * 15 + Math.cos(y / 6.3) * 13 + Math.sin((x + y) / 9) * 8
      const localClutter = Math.sin(x / 2.1 + y / 3.4) * Math.cos(y / 5.2) * 9
      return Math.max(10, Math.min(245, Math.round(105 + gradient + texture + localClutter)))
    })
    const detected = detectDocumentCornersFromRgba(noDocument, 160, 220)
    expect(detected).toBeNull()
  })

  it('falls back to manual corners instead of fabricating missing corners for a partial document', () => {
    const partial = [
      { x: -24, y: 28 },
      { x: 148, y: 16 },
      { x: 166, y: 202 },
      { x: -18, y: 214 },
    ]
    expect(detectDocumentCornersFromRgba(photoLikeFixture(160, 220, partial, { unevenLighting: true }), 160, 220)).toBeNull()
  })

  it('finds a document from boundary edges when document and background tones are nearly identical', () => {
    const points = [
      { x: 34, y: 29 },
      { x: 202, y: 17 },
      { x: 215, y: 142 },
      { x: 19, y: 153 },
    ]
    const detected = detectDocumentCornersFromRgba(edgeOnlyDocumentFixture(235, 180, points), 235, 180)
    expect(detected).not.toBeNull()
    expect(detected?.topLeft.x).toBeCloseTo(points[0].x / 234, 1)
    expect(detected?.topRight.y).toBeCloseTo(points[1].y / 179, 1)
    expect(detected?.bottomRight.x).toBeCloseTo(points[2].x / 234, 1)
  })

  it('keeps normalized detection coordinates stable for a rotated portrait working copy', () => {
    const rotated = [
      { x: 30, y: 24 },
      { x: 130, y: 16 },
      { x: 142, y: 194 },
      { x: 20, y: 202 },
    ]
    const detected = detectDocumentCornersFromRgba(photoLikeFixture(160, 230, rotated, { unevenLighting: true }), 160, 230)
    expect(detected).not.toBeNull()
    expect(detected?.bottomRight.x).toBeCloseTo(rotated[2].x / 159, 1)
    expect(detected?.bottomRight.y).toBeCloseTo(rotated[2].y / 229, 1)
  })

  it('keeps coordinate handling correct for rotated EXIF orientations', () => {
    expect(orientedImageSize({ width: 1200, height: 800 }, 6)).toEqual({ width: 800, height: 1200 })
    expect(normalizeExifPoint({ x: 0.2, y: 0.3 }, 6)).toEqual({ x: 0.7, y: 0.2 })
  })
})
