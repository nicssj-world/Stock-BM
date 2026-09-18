import { describe, expect, it } from 'vitest'
import { matchCatalogs, normalizeCatalog, type CatalogMatchItem } from './catalog-match'

const items: CatalogMatchItem[] = [
  { itemId: 'one', catalogNo: 'ABC-123', itemCode: 'ITEM-1', name: 'First', manufacturer: 'Acme', vendor: 'Vendor A' },
  { itemId: 'two', catalogNo: 'XYZ 900', itemCode: 'ITEM-2', name: 'Second', manufacturer: 'Beta', vendor: 'Vendor B' },
]

describe('catalog OCR matching', () => {
  it('normalizes catalog punctuation and case in the same way as the database index', () => {
    expect(normalizeCatalog(' abC-123 / thai ')).toBe('ABC123THAI')
  })

  it('returns one exact match without using the product name as a match key', () => {
    const result = matchCatalogs('Invoice\nABC 123\nFirst', items)
    expect(result.kind).toBe('exact_unique')
    if (result.kind === 'exact_unique') expect(result.itemId).toBe('one')
  })

  it('keeps duplicate normalized catalog numbers ambiguous', () => {
    const result = matchCatalogs('ABC123', [
      ...items,
      { itemId: 'duplicate', catalogNo: 'A-B-C 123', itemCode: 'ITEM-3', name: 'Duplicate', manufacturer: null, vendor: null },
    ])
    expect(result.kind).toBe('exact_ambiguous')
    if (result.kind === 'exact_ambiguous') expect(result.itemIds).toEqual(['duplicate', 'one'])
  })

  it('returns edit-distance suggestions without auto-selecting a similar item', () => {
    const result = matchCatalogs('XYZ 901', items)
    expect(result.kind).toBe('similar')
    if (result.kind === 'similar') {
      expect(result.candidates[0].itemId).toBe('two')
      expect(result.candidates[0].score).toBeGreaterThan(0.75)
    }
  })

  it('does not false-positive a shorter catalog inside a longer token', () => {
    const result = matchCatalogs('ABC-1234', [{ itemId: 'short', catalogNo: 'ABC-123', itemCode: 'SHORT', name: 'Short', manufacturer: null, vendor: null }])
    expect(result.kind).toBe('none')
  })
})
