const MAX_WIDTH = 900
const MAX_HEIGHT = 260
const MAX_CHARS = 380_000

/**
 * A drawn or photographed signature becomes a small transparent PNG data URL
 * (900x260 at most): near-white paper is made transparent so it prints cleanly
 * on reports. The database re-checks that it is a PNG data URL of a sane size.
 * Browser only (uses createImageBitmap and canvas).
 */
export async function toSignaturePng(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    for (let attempt = 0, scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height); attempt < 4; attempt += 1, scale *= 0.7) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas unavailable')
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] > 0 && image.data[i] > 235 && image.data[i + 1] > 235 && image.data[i + 2] > 235) image.data[i + 3] = 0
      }
      ctx.putImageData(image, 0, 0)
      const png = canvas.toDataURL('image/png')
      if (png.length <= MAX_CHARS) return png
    }
  } finally {
    bitmap.close()
  }
  throw new Error('ลายเซ็นมีรายละเอียดมากเกินไป กรุณาเซ็นให้เรียบง่ายขึ้น')
}
