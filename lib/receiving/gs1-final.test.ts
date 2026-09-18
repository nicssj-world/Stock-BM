import { describe, expect, it } from 'vitest'
import { normalizeGs1DataMatrixPayload, normalizeSeparatorNotation, parseBarcode } from './barcode'
import { decodeDataMatrixAsciiCodewords, resolveScanPayload } from './scan-text'

// Built from char codes so the source stays ASCII and the separator is exact.
const GS = String.fromCharCode(29)

const ROCHE_TPUC3 = ['240', '08058679190', GS, '01', '07613336121535', '10', '94146701', GS, '17', '270531', '11', '251229'].join('')
const FIXTURE_B = ['01', '00382903403837', '17', '270531', '10', '06696', GS, '240', '0933'].join('')

/** ASCII-encodation codewords for a Data Matrix message (digits paired, FNC1 = 232). */
function toCodewords(text: string, leadingFnc1 = true) {
  const words: number[] = leadingFnc1 ? [232] : []
  for (let index = 0; index < text.length;) {
    const pair = text.slice(index, index + 2)
    if (/^\d\d$/.test(pair)) { words.push(130 + Number(pair)); index += 2; continue }
    const char = text[index]
    words.push(char === GS ? 232 : char.charCodeAt(0) + 1)
    index += 1
  }
  return new Uint8Array([...words, 129])
}

describe('Stock1 final GS1 DataMatrix normalization', () => {
  it('accepts ]d2 embedded in the text, from metadata only, or absent', () => {
    for (const [raw, symbology] of [[`]d2${ROCHE_TPUC3}`, null], [ROCHE_TPUC3, ']d2'], [ROCHE_TPUC3, null]] as const) {
      const parsed = parseBarcode(raw, symbology)
      expect(parsed.standard).toBe('gs1')
      expect(parsed.lot).toBe('94146701')
      expect(parsed.expiry).toBe('2027-05-31')
    }
  })

  it('treats a leading FNC1 (decoded as ASCII 29 / U+001D) as a flag, not data', () => {
    const parsed = parseBarcode(`${GS}${FIXTURE_B}`, null)
    expect(parsed).toMatchObject({ gtin: '00382903403837', lot: '06696', expiry: '2027-05-31', additionalProductId: '0933' })
    expect(normalizeGs1DataMatrixPayload(`]d2${GS}${GS}0100382903403837`)).toBe('0100382903403837')
  })

  it('rewrites textual FNC1/GS notations but never strips a mid-stream separator', () => {
    const notations = ['<GS>', '{GS}', '[GS]', '<FNC1>', '{FNC1}', '[FNC1]', String.fromCharCode(92) + 'x1d', String.fromCharCode(92) + 'u001d', String.fromCharCode(0x241d)]
    for (const notation of notations) {
      const parsed = parseBarcode(`]d2${FIXTURE_B.replace(GS, notation)}`, null)
      expect(parsed.lot, notation).toBe('06696')
      expect(parsed.additionalProductId, notation).toBe('0933')
    }
    expect(normalizeSeparatorNotation(`10LOT${GS}17270531`)).toBe(`10LOT${GS}17270531`)
    expect(normalizeGs1DataMatrixPayload(`]d2${GS}10LOT${GS}17270531`)).toBe(`10LOT${GS}17270531`)
  })

  it('reads AI 01, 10, 11, 15, 17, 21 and 240 regardless of order', () => {
    const payload = ['21', 'SER-9', GS, '15', '280101', '240', 'REF-X', GS, '11', '250102', '17', '281231', '10', 'LOT7', GS, '01', '09501101530013'].join('')
    expect(parseBarcode(payload, ']d2')).toMatchObject({
      gtin: '09501101530013',
      lot: 'LOT7',
      manufactureDate: '2025-01-02',
      bestBeforeDate: '2028-01-01',
      expiry: '2028-12-31',
      serial: 'SER-9',
      additionalProductId: 'REF-X',
      catalog: null,
    })
  })

  it('terminates variable-length AIs at GS/FNC1 or at the end of the payload', () => {
    const parsed = parseBarcode(['10', 'A1', GS, '21', 'B2', GS, '240', 'C3'].join(''), ']d2')
    expect(parsed).toMatchObject({ lot: 'A1', serial: 'B2', additionalProductId: 'C3' })
    // Without a separator the variable field runs to the end: nothing is guessed.
    expect(parseBarcode('10A117281231', ']d2').lot).toBe('A117281231')
  })

  it('keeps unrelated but valid AIs (e.g. 91, 7003) instead of failing the whole label', () => {
    const parsed = parseBarcode(['01', '09501101530013', '17', '281231', '10', 'LOT1', GS, '91', 'INTERNAL', GS, '7003', '2512311200'].join(''), ']d2')
    expect(parsed.lot).toBe('LOT1')
    expect(parsed.otherAis).toEqual({ '91': 'INTERNAL', '7003': '2512311200' })
  })

  it('fails safely with no partial fields on malformed payloads', () => {
    for (const raw of ['55NOT-AN-AI', `0109501101530013${'17'}2712`, `10${GS}17281231`, `0101234`, `17${'991399'}`]) {
      const parsed = parseBarcode(raw, ']d2')
      expect(parsed.gtin, raw).toBeNull()
      expect(parsed.lot, raw).toBeNull()
      expect(parsed.expiry, raw).toBeNull()
    }
  })
})

describe('real reagent label fixtures', () => {
  it('Fixture A — Roche cobas TPUC3', () => {
    const parsed = parseBarcode(ROCHE_TPUC3, ']d2')
    expect(parsed).toMatchObject({
      standard: 'gs1',
      gtin: '07613336121535',
      lot: '94146701',
      additionalProductId: '08058679190',
      expiry: '2027-05-31',
      manufactureDate: '2025-12-29',
    })
    // AI 240 equals the printed REF on this label, but it is never written to Catalog/REF.
    expect(parsed.catalog).toBeNull()
    expect(parsed.catalogCandidate?.value).toBe('08058679190')
  })

  it('Fixture B — GTIN 00382903403837', () => {
    const parsed = parseBarcode(FIXTURE_B, ']d2')
    expect(parsed).toMatchObject({ gtin: '00382903403837', expiry: '2027-05-31', lot: '06696', additionalProductId: '0933' })
    expect(parsed.catalog).toBeNull()
    expect(parsed.catalogCandidate).toBeNull()
  })

  it('never turns GTIN or AI 240 into Catalog/REF', () => {
    for (const raw of [ROCHE_TPUC3, FIXTURE_B]) {
      const parsed = parseBarcode(raw, ']d2')
      expect(parsed.catalog).toBeNull()
      expect(parsed.catalog).not.toBe(parsed.gtin)
    }
  })
})

describe('raw Data Matrix codeword fallback', () => {
  it('decodes ASCII-encodation codewords with FNC1 to the same GS1 text', () => {
    expect(decodeDataMatrixAsciiCodewords(toCodewords(FIXTURE_B))).toBe(`${GS}${FIXTURE_B}`)
  })

  it('refuses encodations it does not implement instead of guessing', () => {
    expect(decodeDataMatrixAsciiCodewords([230, 10, 20])).toBeNull()
    expect(decodeDataMatrixAsciiCodewords([231, 10])).toBeNull()
  })

  it('prefers decoded text and only falls back to codewords when the text yields nothing', () => {
    const bytes = toCodewords(FIXTURE_B)
    expect(resolveScanPayload({ text: FIXTURE_B, symbologyId: ']d2', rawBytes: bytes, isDataMatrix: true }).source).toBe('decoded-text')
    const fallback = resolveScanPayload({ text: 'garbled', symbologyId: null, rawBytes: bytes, isDataMatrix: true })
    expect(fallback.source).toBe('raw-codewords')
    expect(parseBarcode(fallback.text, ']d2').lot).toBe('06696')
    expect(resolveScanPayload({ text: 'garbled', symbologyId: null, rawBytes: bytes, isDataMatrix: false }).source).toBe('decoded-text')
  })
})
