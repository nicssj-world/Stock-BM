import { parseBarcode } from './barcode'

const GROUP_SEPARATOR = '\u001d'

/**
 * Decodes the ASCII-encodation codewords of a Data Matrix symbol (ZXing's
 * `getRawBytes()` for DATA_MATRIX) into text, translating FNC1 (232) to the
 * GS1 Group Separator. Returns null when the symbol switches to an
 * encodation this fallback does not implement (C40, Text, X12, EDIFACT,
 * Base 256) so callers keep the decoder's own text instead of guessing.
 */
export function decodeDataMatrixAsciiCodewords(codewords: Uint8Array | number[]): string | null {
  let text = ''
  let upperShift = false
  for (const codeword of codewords) {
    if (codeword === 129) break // pad: end of data
    if (codeword >= 1 && codeword <= 128) {
      text += String.fromCharCode(codeword - 1 + (upperShift ? 128 : 0))
      upperShift = false
    } else if (codeword >= 130 && codeword <= 229) {
      text += String(codeword - 130).padStart(2, '0')
    } else if (codeword === 232) {
      text += GROUP_SEPARATOR
    } else if (codeword === 235) {
      upperShift = true
    } else if (codeword === 236 || codeword === 237) {
      return null // 05/06 macro headers are not used on reagent labels
    } else {
      return null
    }
  }
  return text || null
}

/** Latin-1 view of bytes that already represent decoded text (e.g. a keyboard-wedge capture). */
export function bytesToText(bytes: Uint8Array | number[]) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}

/**
 * Chooses the payload to parse for a camera scan. The decoded text is always
 * preferred; the raw Data Matrix codewords are used only when the decoded
 * text yields no GS1/HIBC data at all but the codewords do.
 */
export function resolveScanPayload(input: { text: string; symbologyId: string | null; rawBytes?: Uint8Array | null; isDataMatrix?: boolean }) {
  const parsed = parseBarcode(input.text, input.symbologyId)
  if (parsed.standard || !input.rawBytes?.length || !input.isDataMatrix) return { text: input.text, source: 'decoded-text' as const }
  const decoded = decodeDataMatrixAsciiCodewords(input.rawBytes)
  if (decoded && parseBarcode(decoded, input.symbologyId).standard) return { text: decoded, source: 'raw-codewords' as const }
  return { text: input.text, source: 'decoded-text' as const }
}
