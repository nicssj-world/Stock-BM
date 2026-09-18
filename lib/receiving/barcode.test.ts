import { barcodeFixtures as fixtures } from './__fixtures__/barcode-fixtures'
import { describe, expect, it } from 'vitest'
import { normalizeGs1DataMatrixPayload, parseBarcode, parseBarcodeWithDiagnostics } from './barcode'

const emptyDecodedFields = {
  standard: null,
  gtin: null,
  catalog: null,
  additionalProductId: null,
  catalogCandidate: null,
  lot: null,
  expiry: null,
  manufactureDate: null,
  bestBeforeDate: null,
  serial: null,
  quantity: null,
  netWeightKg: null,
  hibcPrimary: null,
  hibcSecondary: null,
}

describe('parseBarcode', () => {
  it('parses GS1-128 with a symbology identifier, FNC1, GTIN, lot, expiry, and quantity', () => {
    const fixture = fixtures['gs1-128']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      raw: fixture.raw,
      symbologyId: fixture.symbologyId,
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      expiry: fixture.expiry,
      quantity: fixture.quantity,
      catalog: null,
    })
  })

  it('parses parenthesized GS1 DataMatrix AIs', () => {
    const fixture = fixtures['gs1-datamatrix']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      raw: fixture.raw,
      symbologyId: fixture.symbologyId,
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      expiry: fixture.expiry,
      catalog: null,
    })
  })

  it('accepts GS1 symbology identifiers and parses date, serial, and weight AIs', () => {
    const fixture = fixtures['gs1-additional-ais']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      raw: fixture.raw,
      symbologyId: fixture.symbologyId,
      standard: 'gs1',
      gtin: fixture.gtin,
      manufactureDate: fixture.manufactureDate,
      bestBeforeDate: fixture.bestBeforeDate,
      serial: fixture.serial,
      netWeightKg: fixture.netWeightKg,
      catalog: null,
    })
  })

  it('keeps a GS1 GTIN out of the catalog field', () => {
    const result = parseBarcode(fixtures['gs1-128'].raw, fixtures['gs1-128'].symbologyId)

    expect(result.gtin).toBe(fixtures['gs1-128'].gtin)
    expect(result.catalog).toBeNull()
  })

  it('parses HIBC primary and secondary payloads without treating the primary as a catalog', () => {
    const primary = parseBarcode(fixtures['hibc-primary'].raw)
    const secondary = parseBarcode(fixtures['hibc-secondary'].raw)
    const combined = parseBarcode(fixtures['hibc-combined'].raw)

    expect(primary).toMatchObject({
      standard: 'hibc',
      hibcPrimary: fixtures['hibc-primary'].hibcPrimary,
      catalog: null,
      gtin: null,
    })
    expect(secondary).toMatchObject({
      standard: 'hibc',
      hibcSecondary: fixtures['hibc-secondary'].hibcSecondary,
      lot: fixtures['hibc-secondary'].lot,
      expiry: fixtures['hibc-secondary'].expiry,
      catalog: null,
      gtin: null,
    })
    expect(combined).toMatchObject({
      standard: 'hibc',
      hibcPrimary: fixtures['hibc-combined'].hibcPrimary,
      hibcSecondary: fixtures['hibc-combined'].hibcSecondary,
      lot: fixtures['hibc-combined'].lot,
      expiry: fixtures['hibc-combined'].expiry,
      catalog: null,
      gtin: null,
    })
  })

  it('parses a real iPhone/ZXing DataMatrix scan shape: leading FNC1 rendered as a literal ASCII 29 GS before the AI stream', () => {
    // ZXing (and every AIM-compliant scanner) translates the DataMatrix
    // message's leading FNC1 codeword into a literal GS character. It is a
    // "this message is GS1-formatted" flag, not data, and the scanner never
    // gives us the "]d2" symbology identifier as text or metadata — this is
    // exactly what a real camera scan handed to parseBarcode looks like.
    const fixture = fixtures['gs1-datamatrix-real-scan']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      raw: fixture.raw,
      standard: 'gs1',
      gtin: fixture.gtin,
      expiry: fixture.expiry,
      lot: fixture.lot,
      catalog: null,
    })
  })

  it('parses a real-scan-shaped payload with a mid-stream GS terminating a variable-length lot before a fixed expiry and trailing serial', () => {
    const fixture = fixtures['gs1-datamatrix-real-scan-mid-stream-gs']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      raw: fixture.raw,
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      expiry: fixture.expiry,
      serial: fixture.serial,
      catalog: null,
    })
  })

  it('parses AI 240 (Additional Product Identification) as its own field, never copied into catalog', () => {
    const fixture = fixtures['gs1-datamatrix-second-reagent']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      expiry: fixture.expiry,
      additionalProductId: fixture.additionalProductId,
      catalog: null,
    })
    // No manufacturer-specific rule matches this GTIN prefix, so AI 240 must
    // not be proposed as a Catalog/REF candidate either.
    expect(result.catalogCandidate).toBeNull()
  })

  it('does not depend on AI ordering: the same fields parse the same way regardless of AI order', () => {
    const given = parseBarcode(fixtures['gs1-datamatrix-second-reagent'].raw, fixtures['gs1-datamatrix-second-reagent'].symbologyId)
    const reordered = parseBarcode(fixtures['gs1-datamatrix-second-reagent-reordered'].raw, fixtures['gs1-datamatrix-second-reagent-reordered'].symbologyId)

    expect(reordered).toMatchObject({
      standard: 'gs1',
      gtin: given.gtin,
      lot: given.lot,
      expiry: given.expiry,
      additionalProductId: given.additionalProductId,
      catalog: null,
      catalogCandidate: null,
    })
  })

  it('parses a real Roche cobas TPUC3 label: GTIN, lot, expiry, manufacture date, and AI 240 kept separate from GTIN and catalog', () => {
    const fixture = fixtures['gs1-datamatrix-roche-cobas-tpuc3']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      expiry: fixture.expiry,
      manufactureDate: fixture.manufactureDate,
      additionalProductId: fixture.additionalProductId,
      catalog: null,
    })
    expect(result.gtin).not.toBe(result.additionalProductId)
  })

  it('proposes AI 240 as a Catalog/REF candidate only for the Roche cobas label — not as a general GS1 rule', () => {
    const roche = fixtures['gs1-datamatrix-roche-cobas-tpuc3']
    const rocheResult = parseBarcode(roche.raw, roche.symbologyId)

    expect(rocheResult.catalogCandidate).toEqual({
      value: roche.catalogCandidateValue,
      source: 'ai240',
      reason: expect.stringContaining('Roche'),
    })
    // The proposal is only ever a *candidate* — `catalog` itself is never
    // auto-populated from it.
    expect(rocheResult.catalog).toBeNull()

    // The second reagent fixture also has AI 240 present, but its GTIN
    // prefix is not a known Roche cobas one, so no candidate is proposed.
    const other = fixtures['gs1-datamatrix-second-reagent']
    const otherResult = parseBarcode(other.raw, other.symbologyId)
    expect(otherResult.additionalProductId).not.toBeNull()
    expect(otherResult.catalogCandidate).toBeNull()
  })

  it('parses two variable-length AIs back to back, each correctly terminated by its own GS', () => {
    const fixture = fixtures['gs1-datamatrix-multiple-variable-fields']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      standard: 'gs1',
      gtin: fixture.gtin,
      lot: fixture.lot,
      serial: fixture.serial,
      expiry: fixture.expiry,
      catalog: null,
    })
  })

  it('parses correctly when ]d2 is supplied only as out-of-band metadata and the decoded text has no leading FNC1/GS at all', () => {
    const fixture = fixtures['gs1-datamatrix-metadata-only-symbology']
    const result = parseBarcode(fixture.raw, fixture.symbologyId)

    expect(result).toMatchObject({
      standard: 'gs1',
      gtin: fixture.gtin,
      expiry: fixture.expiry,
      lot: fixture.lot,
      catalog: null,
    })
  })

  it('normalizeGs1DataMatrixPayload strips a leading GS run and an embedded symbology prefix, but never a mid-stream GS', () => {
    expect(normalizeGs1DataMatrixPayload('0109501101530013')).toBe('0109501101530013')
    expect(normalizeGs1DataMatrixPayload('0109501101530013')).toBe('0109501101530013')
    expect(normalizeGs1DataMatrixPayload(']d20109501101530013')).toBe('0109501101530013')
    expect(normalizeGs1DataMatrixPayload('0109501101530013')).toBe('0109501101530013')
    // A mid-stream GS (a real field terminator) must survive normalization.
    expect(normalizeGs1DataMatrixPayload('010950110153001317271231')).toBe('010950110153001317271231')
  })

  it('parseBarcodeWithDiagnostics surfaces the canonical payload and a specific reason on failure instead of a silent empty result', () => {
    const fixture = fixtures['gs1-datamatrix-unrecognized-ai']
    const diagnostics = parseBarcodeWithDiagnostics(fixture.raw, fixture.symbologyId)

    expect(diagnostics.canonicalPayload).toBe('99UNKNOWNAI0109501101530013')
    expect(diagnostics.parserError).toMatch(/Unrecognized AI/)
    expect(diagnostics.result.gtin).toBeNull()
  })

  it('parseBarcodeWithDiagnostics reports no error and the canonical payload for a successful parse', () => {
    const fixture = fixtures['gs1-datamatrix-real-scan']
    const diagnostics = parseBarcodeWithDiagnostics(fixture.raw, fixture.symbologyId)

    expect(diagnostics.parserError).toBeNull()
    // The fixture's raw text has a leading GS (the decoded leading FNC1);
    // the canonical payload has it stripped.
    expect(diagnostics.canonicalPayload).toBe(fixture.raw.replace(/^+/, ''))
    expect(diagnostics.result.gtin).toBe(fixture.gtin)
    expect(diagnostics.result.lot).toBe(fixture.lot)
    expect(diagnostics.result.expiry).toBe(fixture.expiry)
  })

  it('still fails safely (no partial fields) when a leading GS is followed by garbage instead of a real AI stream', () => {
    const raw = 'not-a-valid-ai-stream'
    expect(() => parseBarcode(raw, null)).not.toThrow()
    expect(parseBarcode(raw, null)).toEqual({ raw, symbologyId: null, ...emptyDecodedFields })
  })

  it('returns the raw malformed payload without throwing or returning partial decoded values', () => {
    const fixture = fixtures.malformed
    expect(() => parseBarcode(fixture.raw, fixture.symbologyId)).not.toThrow()

    expect(parseBarcode(fixture.raw, fixture.symbologyId)).toEqual({
      raw: fixture.raw,
      symbologyId: fixture.symbologyId,
      ...emptyDecodedFields,
    })
  })
})
