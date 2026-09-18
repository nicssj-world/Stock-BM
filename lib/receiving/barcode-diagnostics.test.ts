import { describe, expect, it } from 'vitest'
import { bytesToHex, describeBarcodeScan, escapeBarcodeText, textCodePointsHex } from './barcode-diagnostics'

describe('barcode scan diagnostics (Preview-only)', () => {
  it('renders GS1 control characters explicitly instead of unreadable square glyphs', () => {
    expect(escapeBarcodeText('0109501101530013')).toBe('<GS>0109501101530013')
    expect(escapeBarcodeText('ABCDEF')).toBe('AB<GS>CD<RS>EF')
    expect(escapeBarcodeText('plain text')).toBe('plain text')
  })

  it('formats raw bytes as hex and passes through null when unavailable', () => {
    expect(bytesToHex(new Uint8Array([0x01, 0x1d, 0xff]))).toBe('01 1d ff')
    expect(bytesToHex(null)).toBeNull()
    expect(bytesToHex(new Uint8Array())).toBeNull()
  })

  it('lists the decoded text\'s own code points in hex, distinct from raw (pre-decode) bytes', () => {
    expect(textCodePointsHex('01')).toBe('30 31')
    expect(textCodePointsHex('01')).toBe('1d 30 31')
  })

  it('describes a real scan shape end to end: escaped payload, hex bytes, code points, normalized payload, and parsed GS1 fields', () => {
    const raw = '01095011015300131727123110LOT123'
    const diagnostics = describeBarcodeScan({
      raw,
      symbologyId: null,
      // Raw bytes are the pre-ASCII-decode DataMatrix codeword stream, not
      // the same bytes as the decoded text — FNC1 is codeword 0xE8 there,
      // not 0x1D. Diagnostics show both, distinctly.
      rawBytes: new Uint8Array([0xe8, 0x83, 0x84]),
      barcodeFormat: 5,
    })

    expect(diagnostics.rawEscaped).toBe('<GS>01095011015300131727123110LOT123')
    expect(diagnostics.rawBytesHex).toBe('e8 83 84')
    expect(diagnostics.textCodePointsHex.startsWith('1d 30 31')).toBe(true)
    expect(diagnostics.normalizedPayload).toBe('01095011015300131727123110LOT123')
    expect(diagnostics.parserError).toBeNull()
    expect(diagnostics.parsed.gtin).toBe('09501101530013')
    expect(diagnostics.parsed.expiry).toBe('2027-12-31')
    expect(diagnostics.parsed.lot).toBe('LOT123')
    expect(diagnostics.parsed.catalog).toBeNull()
  })

  it('surfaces a parser error and the normalized payload when a scan does not parse', () => {
    const diagnostics = describeBarcodeScan({ raw: '99UNKNOWNAI0109501101530013', symbologyId: ']d2' })

    expect(diagnostics.normalizedPayload).toBe('99UNKNOWNAI0109501101530013')
    expect(diagnostics.parserError).toMatch(/Unrecognized AI/)
    expect(diagnostics.parsed.gtin).toBeNull()
  })
})
