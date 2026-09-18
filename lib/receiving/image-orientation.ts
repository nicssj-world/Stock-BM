// Reads the EXIF Orientation tag (0x0112) from a JPEG header. Browsers already
// apply it when decoding an <img> (image-orientation: from-image), so the crop
// works on upright pixels; this value is recorded only as evidence metadata.

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function readJpegOrientation(bytes: Uint8Array): ExifOrientation | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    const length = view.getUint16(offset + 2)
    if (length < 2) return null
    if (marker === 0xe1 && offset + 10 <= bytes.length && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10
      if (tiff + 8 > bytes.length) return null
      const little = view.getUint16(tiff) === 0x4949
      if (!little && view.getUint16(tiff) !== 0x4d4d) return null
      const ifd = tiff + view.getUint32(tiff + 4, little)
      if (ifd + 2 > bytes.length) return null
      const entries = view.getUint16(ifd, little)
      for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12
        if (entry + 12 > bytes.length) return null
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little)
          return value >= 1 && value <= 8 ? value as ExifOrientation : null
        }
      }
      return null
    }
    if (marker === 0xda) return null
    offset += 2 + length
  }
  return null
}

/** Orientations 5–8 swap width and height once applied. */
export function orientationSwapsAxes(orientation: ExifOrientation | null) {
  return orientation !== null && orientation >= 5
}
