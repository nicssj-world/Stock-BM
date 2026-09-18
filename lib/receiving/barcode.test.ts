import { barcodeFixtures as fixtures } from './__fixtures__/barcode-fixtures'
import { describe, expect, it } from 'vitest'
import { parseBarcode } from './barcode'

const emptyDecodedFields = {
  standard: null,
  gtin: null,
  catalog: null,
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
