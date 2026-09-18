import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/camera-scanner.ts'), 'utf8')

describe('shared camera scanner metadata plumbing', () => {
  it('keeps the legacy code callback and exposes ZXing metadata and raw bytes', () => {
    expect(source).toContain('onScan: (code: string, details?: CameraScanResult) => void')
    expect(source).toContain('getResultMetadata()')
    expect(source).toContain('getRawBytes()')
    expect(source).toContain('onScanRef.current(code,')
  })

  it('sets explicit ZXing format hints for GS1, HIBC, and 2D package scans', () => {
    expect(source).toContain('DecodeHintType.POSSIBLE_FORMATS')
    expect(source).toContain('BarcodeFormat.CODE_128')
    expect(source).toContain('BarcodeFormat.DATA_MATRIX')
    expect(source).toContain('BarcodeFormat.CODE_39')
    expect(source).toContain('BarcodeFormat.RSS_EXPANDED')
  })

  it('derives the symbology identifier from the detected barcode format instead of a text prefix ZXing never emits', () => {
    // getText() never carries an embedded "]d2"-style AIM prefix and
    // @zxing/library's ResultMetadataType has no SYMBOLOGY_IDENTIFIER entry,
    // so a regex against the decoded text (the previous approach) always
    // returned null on a real scan. Derive it from the barcode format instead.
    expect(source).toContain('function symbologyIdFromBarcodeFormat(')
    expect(source).not.toMatch(/code\.match\(\/\^\\\]/)
    expect(source).toContain('symbologyIdFromBarcodeFormat(barcodeFormat)')
  })
})
