import { barcodeFixtures as fixtureData } from './__fixtures__/barcode-fixtures'
import { describe, expect, it } from 'vitest'
import { parseBarcode } from './barcode'
import { matchPackageBarcode, packageScanResponse } from './package-scan'

const candidates = [
  { itemId: 'item-1', itemCode: 'ITEM-1', name: 'Item one', unit: 'box' },
  { itemId: 'item-2', itemCode: 'ITEM-2', name: 'Item two', unit: 'box' },
]

describe('matchPackageBarcode', () => {
  it('returns one exact candidate without copying GTIN into catalog', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates.slice(0, 1), null)

    expect(result).toMatchObject({
      itemId: 'item-1',
      match: { kind: 'exact_unique', itemId: 'item-1' },
      conflicts: [],
    })
    expect(result.parsed.catalog).toBeNull()
  })

  it('serializes the exact REF match at BOTH itemId paths for the receiving popup', () => {
    const parsed = { ...parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId), additionalProductId: '09040803190' }
    const resolution = matchPackageBarcode(parsed, candidates.slice(0, 1), null, 'ai240_catalog')
    const response = packageScanResponse(resolution)
    expect(response).toMatchObject({
      itemId: 'item-1',
      parsed: { itemId: 'item-1', additionalProductId: '09040803190' },
      match: { kind: 'exact_unique', source: 'ai240_catalog', itemId: 'item-1' },
      conflicts: [],
    })
  })

  it('keeps null at BOTH itemId paths for an ambiguous or missing match', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    for (const resolution of [matchPackageBarcode(parsed, candidates, null), matchPackageBarcode(parsed, [], null)]) {
      const response = packageScanResponse(resolution)
      expect(response).toHaveProperty('itemId', null)
      expect(response.parsed.itemId).toBeNull()
    }
  })

  it('returns every candidate and refuses to auto-select an ambiguous GTIN', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates, null)

    expect(result.itemId).toBeNull()
    expect(result.match.kind).toBe('exact_ambiguous')
    expect(result.match.candidates.map((candidate) => candidate.itemId)).toEqual(['item-1', 'item-2'])
    expect(result.conflicts[0]?.code).toBe('ambiguous_gtin')
  })

  it('accepts an ambiguous GTIN only when the user already chose one of its exact candidates', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates, 'item-2')

    expect(result.itemId).toBe('item-2')
    expect(result.conflicts).toEqual([])
    expect(matchPackageBarcode(parsed, candidates, 'item-9').conflicts[0]?.code).toBe('ambiguous_gtin')
  })

  it('blocks using a unique barcode when it conflicts with the selected item', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates.slice(0, 1), 'item-2')

    expect(result.itemId).toBeNull()
    expect(result.match.kind).toBe('exact_unique')
    expect(result.conflicts[0]?.code).toBe('barcode_item_mismatch')
  })

  it('uses an exact existing REF candidate from AI 240 only when provided by the resolver', () => {
    const parsed = { ...parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId), additionalProductId: '09040803190' }
    const resolution = matchPackageBarcode(parsed, candidates.slice(0, 1), null, 'ai240_catalog')
    expect(resolution.match.source).toBe('ai240_catalog')
    expect(resolution.itemId).toBe('item-1')
    expect(resolution.parsed.catalog).toBeNull()
    const ambiguous = matchPackageBarcode(parsed, candidates, null, 'ai240_catalog')
    expect(ambiguous.itemId).toBeNull()
    expect(ambiguous.conflicts[0]?.code).toBe('ambiguous_gtin')
  })

  it('keeps a no-GTIN payload usable as a manual raw scan without selecting an item', () => {
    const parsed = parseBarcode(fixtureData['hibc-secondary'].raw)
    const result = matchPackageBarcode(parsed, candidates, null)

    expect(result.itemId).toBeNull()
    expect(result.match).toMatchObject({ kind: 'none', itemId: null, candidates: [] })
    expect(result.conflicts).toEqual([])
    expect(result.parsed.raw).toBe(fixtureData['hibc-secondary'].raw)
  })
})
