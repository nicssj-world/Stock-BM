import { describe, expect, it } from 'vitest'
import { bytesToHex, describeBarcodeScan, escapeBarcodeText } from './barcode-diagnostics'

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

  it('describes a real scan shape end to end: escaped payload, hex bytes, and parsed GS1 fields', () => {
    const raw = '01095011015300131727123110LOT123'
    const diagnostics = describeBarcodeScan({
      raw,
      symbologyId: null,
      rawBytes: new Uint8Array([0x1d, 0x30, 0x31]),
      barcodeFormat: 5,
    })

    expect(diagnostics.rawEscaped).toBe('<GS>01095011015300131727123110LOT123')
    expect(diagnostics.rawBytesHex).toBe('1d 30 31')
    expect(diagnostics.parsed.gtin).toBe('09501101530013')
    expect(diagnostics.parsed.expiry).toBe('2027-12-31')
    expect(diagnostics.parsed.lot).toBe('LOT123')
    expect(diagnostics.parsed.catalog).toBeNull()
  })
})
