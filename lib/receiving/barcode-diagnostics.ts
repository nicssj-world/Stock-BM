import { parseBarcode, type ParsedBarcode } from './barcode'

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

export type BarcodeScanDiagnostics = {
  rawEscaped: string
  rawBytesHex: string | null
  symbologyId: string | null
  barcodeFormat: number | null
  parsed: ParsedBarcode
}

export function describeBarcodeScan(input: {
  raw: string
  symbologyId?: string | null
  rawBytes?: Uint8Array | null
  barcodeFormat?: number | null
}): BarcodeScanDiagnostics {
  return {
    rawEscaped: escapeBarcodeText(input.raw),
    rawBytesHex: bytesToHex(input.rawBytes ?? null),
    symbologyId: input.symbologyId ?? null,
    barcodeFormat: input.barcodeFormat ?? null,
    parsed: parseBarcode(input.raw, input.symbologyId ?? null),
  }
}
