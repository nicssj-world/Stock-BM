import { parseBarcodeWithDiagnostics, type ParsedBarcode } from './barcode'

const CONTROL_CHARACTER_LABELS: Record<number, string> = {
  0x1c: '<FS>',
  0x1d: '<GS>',
  0x1e: '<RS>',
  0x1f: '<US>',
  0x04: '<EOT>',
}

/**
 * Renders control characters explicitly (e.g. the GS1 Group Separator that
 * scanner libraries emit for FNC1) instead of letting the browser draw an
 * unreadable tofu/square glyph for them. Preview-only diagnostics use this so
 * a real scan's raw payload is legible instead of a wall of "control-
 * character-looking separators".
 */
export function escapeBarcodeText(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) out += CONTROL_CHARACTER_LABELS[code] ?? `<0x${code.toString(16).padStart(2, '0')}>`
    else out += char
  }
  return out
}

export function bytesToHex(bytes: Uint8Array | null): string | null {
  if (!bytes || !bytes.length) return null
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

/**
 * Hex code points of the DECODED TEXT — distinct from `rawBytesHex`, which
 * (for DataMatrix specifically) is the pre-ASCII-decode codeword stream, not
 * the same bytes as the text. FNC1 shows as codeword 0xE8 in raw bytes but
 * as the decoded 0x1D (GS) at the corresponding position in the text; this
 * is exactly case D ("FNC1 represented in raw bytes but omitted/transformed
 * in decoded text") and is why the AI parser is built to read the decoded
 * text, not raw bytes.
 */
export function textCodePointsHex(value: string): string {
  return [...value].map((char) => (char.codePointAt(0) ?? 0).toString(16).padStart(2, '0')).join(' ')
}

export type BarcodeScanDiagnostics = {
  rawEscaped: string
  rawBytesHex: string | null
  textCodePointsHex: string
  symbologyId: string | null
  barcodeFormat: number | null
  normalizedPayload: string | null
  parserError: string | null
  parsed: ParsedBarcode
}

export function describeBarcodeScan(input: {
  raw: string
  symbologyId?: string | null
  rawBytes?: Uint8Array | null
  barcodeFormat?: number | null
}): BarcodeScanDiagnostics {
  const diagnostics = parseBarcodeWithDiagnostics(input.raw, input.symbologyId ?? null)
  return {
    rawEscaped: escapeBarcodeText(input.raw),
    rawBytesHex: bytesToHex(input.rawBytes ?? null),
    textCodePointsHex: textCodePointsHex(input.raw),
    symbologyId: input.symbologyId ?? null,
    barcodeFormat: input.barcodeFormat ?? null,
    normalizedPayload: diagnostics.canonicalPayload,
    parserError: diagnostics.parserError,
    parsed: diagnostics.result,
  }
}
