import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { beginCropDrag, clampCropPoint, endCropDrag, moveCropDrag } from '@/lib/receiving/document-crop'
import { calculateDisplayedImageRect } from './invoice-image-crop'

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
    expect(source).toMatch(/onConfirmed\?\.\(\{ originalImage, cropCorners, processedImage: rectified\.dataUrl, skipped: false,/)
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

  it('maps the crop overlay through the displayed-image content rect, not the outer frame, so letterboxing does not misplace corners', () => {
    expect(source).toContain('calculateDisplayedImageRect')
    expect(source).toContain('frameWidth')
    expect(source).toContain('frameHeight')
    expect(source).toContain('function framePercent(')
    expect(source).toContain('function pointerToNormalized(')
    // The polyline uses a normalized 0-100 viewBox that scales to the actual
    // frame size, instead of drawing in raw (unscaled) pixel coordinates —
    // otherwise a percentage-valued polyline squeezes into the top-left
    // corner of any frame that is not exactly 100x100 CSS pixels.
    expect(source).toContain('viewBox="0 0 100 100"')
    expect(source).toContain('preserveAspectRatio="none"')
  })

  it('replaces the old large circular corner handles with small L-shaped brackets and a separate touch target', () => {
    // Real-iPhone acceptance feedback: the previous large filled circles were
    // "confusing and too intrusive". A document-scanner-style corner grip —
    // a small high-contrast L-shaped bracket, with the actual touch target
    // enlarged separately and invisibly underneath — replaces them.
    expect(source).not.toMatch(/size-5 rounded-full/)
    expect(source).not.toMatch(/size-7 rounded-full border-2 border-white/)
    expect(source).toContain('cornerBracketRotation')
    expect(source).toContain('<path d="M4 15V4H15"')
    expect(source).toMatch(/size-12 -translate-x-1\/2 -translate-y-1\/2 touch-none/)
    // The visible bracket and the touch target are two separate elements.
    expect(source).toContain('<Fragment key={key}>')
  })

  it('highlights the active corner while dragging instead of showing a magnifier', () => {
    expect(source).toContain('dragging === key')
    expect(source).toMatch(/active \? '#f5a623' : '#0b7f76'/)
  })

  it('removes the magnifier/loupe entirely rather than keeping an oversized high-zoom implementation', () => {
    // Real-iPhone acceptance feedback: the loupe zoomed too much and removed
    // surrounding context. Per the preferred fix, it is removed outright —
    // the small bracket, edge lines, and active-corner highlight are enough.
    expect(source).not.toContain('LOUPE_SIZE')
    expect(source).not.toContain('LOUPE_MAGNIFICATION')
    expect(source).not.toContain('calculateLoupeViewportPosition')
    expect(source).not.toContain('setLoupe')
    expect(source).not.toContain('backgroundImage')
  })

  it('uses a static (not conditionally toggled) touch-action so iOS Safari never starts a page scroll from a corner drag', () => {
    // iOS Safari reads the touch-action value in effect at the moment a
    // touch begins, before any JS handler runs — flipping touch-action in a
    // pointerdown handler (or via React state re-render) is consistently too
    // late there. Each corner's touch target is statically touch-none;nothing
    // conditionally switches it to/from "none" based on drag state.
    expect(source).not.toMatch(/touchAction:\s*dragging/)
    expect(source).not.toContain("style.touchAction")
    expect(source).toMatch(/className="absolute z-20 size-12[^"]*touch-none[^"]*"/)
    expect(source).toContain('touch-pan-y')
  })

  it('preserves touch offset, clamps corner movement, and supports pointer capture release', () => {
    expect(source).toContain('dragOffsetRef')
    expect(source).toContain('clampCropPoint')
    expect(source).toContain('onPointerUp={endDrag}')
    expect(source).toContain('onPointerCancel={endDrag}')
    expect(source).toContain('releasePointerCapture')
    expect(source).toContain('event.preventDefault()')
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

describe('displayed-image content rect (object-fit: contain letterboxing)', () => {
  function rect(width: number, height: number): DOMRect {
    return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) } as DOMRect
  }

  it('computes horizontal letterbox offsets for a portrait image in a wider mobile container', () => {
    // A portrait invoice photo (1200x1600) shown inside a wider phone
    // viewport frame (360x480, a 3:4 landscape-ish container relative to the
    // portrait image) is letterboxed left/right, not top/bottom.
    const frame = rect(360, 480)
    const image = { width: 1200, height: 1600 }
    const displayed = calculateDisplayedImageRect(frame, image)

    expect(displayed.height).toBe(480)
    expect(displayed.width).toBeCloseTo(360, 0)
    expect(displayed.top).toBe(0)
    expect(displayed.left).toBeGreaterThanOrEqual(0)
    expect(displayed.frameWidth).toBe(360)
    expect(displayed.frameHeight).toBe(480)
  })

  it('computes vertical letterbox offsets for a landscape image in a taller container', () => {
    const frame = rect(400, 600)
    const image = { width: 1600, height: 900 }
    const displayed = calculateDisplayedImageRect(frame, image)

    expect(displayed.width).toBe(400)
    expect(displayed.height).toBeCloseTo(225, 0)
    expect(displayed.left).toBe(0)
    expect(displayed.top).toBeGreaterThan(0)
    expect(displayed.top + displayed.height).toBeLessThanOrEqual(600)
  })
})

describe('real pointer drag sequence through the content rect', () => {
  function displayToNormalized(clientPoint: { x: number; y: number }, rect: ReturnType<typeof calculateDisplayedImageRect>) {
    return clampCropPoint({
      x: (clientPoint.x - rect.left) / rect.width,
      y: (clientPoint.y - rect.top) / rect.height,
    })
  }

  it('drags a corner through a letterboxed frame without the point jumping, preserving finger-to-point offset', () => {
    const frame = { x: 0, y: 0, left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480, toJSON: () => ({}) } as DOMRect
    const rect = calculateDisplayedImageRect(frame, { width: 1200, height: 1600 })

    // The corner sits at normalized (0.1, 0.1); the finger touches down
    // slightly off from the exact corner (a realistic imprecise touch).
    const corner = { x: 0.1, y: 0.1 }
    const pointerDownClient = { x: rect.left + rect.width * 0.11, y: rect.top + rect.height * 0.12 }
    const pointerDownNormalized = displayToNormalized(pointerDownClient, rect)

    const drag = beginCropDrag('topLeft', 1, corner, pointerDownNormalized)

    // Move the finger by a fixed delta in client pixels.
    const pointerMoveClient = { x: pointerDownClient.x + 40, y: pointerDownClient.y + 30 }
    const pointerMoveNormalized = displayToNormalized(pointerMoveClient, rect)
    const moved = moveCropDrag(drag, 'topLeft', 1, pointerMoveNormalized)

    expect(moved).not.toBeNull()
    // The point moves by the same normalized delta as the finger did — it
    // does not jump to the finger's raw position (which would discard the
    // initial down-touch offset from the true corner).
    const expectedDelta = { x: 40 / rect.width, y: 30 / rect.height }
    expect(moved!.x).toBeCloseTo(corner.x + expectedDelta.x, 5)
    expect(moved!.y).toBeCloseTo(corner.y + expectedDelta.y, 5)

    // A pointermove from an unrelated pointer id is ignored.
    expect(moveCropDrag(drag, 'topLeft', 2, pointerMoveNormalized)).toBeNull()

    const ended = endCropDrag(drag, 'topLeft', 1)
    expect(ended).toEqual({ key: null, pointerId: null, offset: null })
  })

  it('clamps the dragged point to the displayed-image bounds when the finger moves outside the frame', () => {
    const frame = { x: 0, y: 0, left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480, toJSON: () => ({}) } as DOMRect
    const rect = calculateDisplayedImageRect(frame, { width: 1200, height: 1600 })
    const corner = { x: 0.05, y: 0.05 }
    const drag = beginCropDrag('topLeft', 1, corner, corner)

    // Finger moves far above and to the left of the frame entirely.
    const pointer = clampCropPoint({ x: (rect.left - 200) / rect.width, y: (rect.top - 200) / rect.height })
    const moved = moveCropDrag(drag, 'topLeft', 1, pointer)

    expect(moved).toEqual({ x: 0, y: 0 })
  })
})
