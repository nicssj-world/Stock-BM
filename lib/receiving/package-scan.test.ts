import fixtureData from './__fixtures__/barcode-fixtures.json'
import { describe, expect, it } from 'vitest'
import { parseBarcode } from './barcode'
import { matchPackageBarcode } from './package-scan'

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

  it('returns every candidate and refuses to auto-select an ambiguous GTIN', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates, null)

    expect(result.itemId).toBeNull()
    expect(result.match.kind).toBe('exact_ambiguous')
    expect(result.match.candidates.map((candidate) => candidate.itemId)).toEqual(['item-1', 'item-2'])
    expect(result.conflicts[0]?.code).toBe('ambiguous_gtin')
  })

  it('blocks using a unique barcode when it conflicts with the selected item', () => {
    const parsed = parseBarcode(fixtureData['gs1-128'].raw, fixtureData['gs1-128'].symbologyId)
    const result = matchPackageBarcode(parsed, candidates.slice(0, 1), 'item-2')

    expect(result.itemId).toBeNull()
    expect(result.match.kind).toBe('exact_unique')
    expect(result.conflicts[0]?.code).toBe('barcode_item_mismatch')
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
