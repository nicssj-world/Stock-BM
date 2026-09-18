// Simple rectangular crop geometry for invoice evidence photos. All values are
// normalized to the displayed (already EXIF-upright) image: 0..1 on each axis.
// There is deliberately no perspective correction or document detection.

export type CropRect = { x: number; y: number; width: number; height: number }
export type CropHandle = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w'
export type PixelRect = { x: number; y: number; width: number; height: number }

/** Smallest crop edge as a fraction of the image, so a stray tap cannot collapse the crop. */
export const MIN_CROP_FRACTION = 0.08

export const FULL_CROP_RECT: CropRect = { x: 0, y: 0, width: 1, height: 1 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeCropRect(rect: CropRect, min = MIN_CROP_FRACTION): CropRect {
  const width = clamp(Number.isFinite(rect.width) ? rect.width : 1, min, 1)
  const height = clamp(Number.isFinite(rect.height) ? rect.height : 1, min, 1)
  return {
    x: clamp(Number.isFinite(rect.x) ? rect.x : 0, 0, 1 - width),
    y: clamp(Number.isFinite(rect.y) ? rect.y : 0, 0, 1 - height),
    width,
    height,
  }
}

/**
 * Applies a pointer delta (normalized) to the rect captured at drag start.
 * `move` pans the whole rectangle; edge/corner handles resize it while the
 * opposite edge stays fixed.
 */
export function dragCropRect(start: CropRect, handle: CropHandle, dx: number, dy: number, min = MIN_CROP_FRACTION): CropRect {
  if (handle === 'move') {
    return normalizeCropRect({ ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) }, min)
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes('w')) left = clamp(left + dx, 0, right - min)
  if (handle.includes('e')) right = clamp(right + dx, left + min, 1)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - min)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, 1)
  return normalizeCropRect({ x: left, y: top, width: right - left, height: bottom - top }, min)
}

/** Converts a normalized rect to whole source pixels, always inside the image. */
export function cropRectToPixels(rect: CropRect, imageWidth: number, imageHeight: number): PixelRect {
  const safe = normalizeCropRect(rect, 0)
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(safe.x * imageWidth)))
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(safe.y * imageHeight)))
  const width = Math.max(1, Math.min(imageWidth - x, Math.round(safe.width * imageWidth)))
  const height = Math.max(1, Math.min(imageHeight - y, Math.round(safe.height * imageHeight)))
  return { x, y, width, height }
}

export function isFullCrop(rect: CropRect) {
  return rect.x <= 0.0005 && rect.y <= 0.0005 && rect.width >= 0.999 && rect.height >= 0.999
}

/** Fits an image inside a frame (object-fit: contain) and returns the drawn box. */
export function containRect(frameWidth: number, frameHeight: number, imageWidth: number, imageHeight: number) {
  if (!frameWidth || !frameHeight || !imageWidth || !imageHeight) return { left: 0, top: 0, width: 0, height: 0 }
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  return { left: (frameWidth - width) / 2, top: (frameHeight - height) / 2, width, height }
}

/** Downscale target for the working copy: keeps evidence legible and uploads small. */
export function scaledSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (!longest || longest <= maxEdge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function isSupportedInvoiceImage(file: { type: string; name: string }) {
  return file.type.toLowerCase().startsWith('image/') || /\.(?:heic|heif|jpe?g|png|webp)$/i.test(file.name)
}
