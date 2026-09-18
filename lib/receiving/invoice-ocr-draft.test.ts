import { describe, expect, it } from 'vitest'
import { buildInvoiceOcrDraftLines, type InvoiceOcrItem } from './invoice-ocr-draft'

const items: InvoiceOcrItem[] = [
  { itemId: 'item-1', catalogNo: 'ABC-123', itemCode: 'BM-001', name: 'Master item', manufacturer: 'Acme', vendor: 'Vendor' },
  { itemId: 'item-2', catalogNo: 'XYZ-900', itemCode: 'BM-002', name: 'Second item', manufacturer: 'Beta', vendor: 'Vendor' },
]

describe('invoice OCR draft suggestions', () => {
  it('uses the Item Master name only for an exact unique catalog match', () => {
    const [line] = buildInvoiceOcrDraftLines('ABC-123 Qty: 4 LOT: L-01 EXP: 2027-12-31', items)
    expect(line).toMatchObject({
      stockItemId: 'item-1',
      descriptionText: 'Master item',
      catalogNoText: 'ABC-123',
      expectedQty: 4,
      lotText: 'L-01',
      expiryText: '2027-12-31',
      matchMethod: 'exact_unique',
    })
  })

  it('never selects an ambiguous or similar item', () => {
    const [ambiguous] = buildInvoiceOcrDraftLines('ABC123', [...items, { ...items[0], itemId: 'duplicate', itemCode: 'BM-003' }])
    const [similar] = buildInvoiceOcrDraftLines('XYZ-901', items)
    expect(ambiguous).toMatchObject({ stockItemId: null, descriptionText: null, matchMethod: 'exact_ambiguous' })
    expect(similar).toMatchObject({ stockItemId: null, descriptionText: null, matchMethod: 'similar' })
  })

  it('keeps unmatched OCR text as review evidence without treating it as a product name', () => {
    const [line] = buildInvoiceOcrDraftLines('Unknown product from invoice', items)
    expect(line).toMatchObject({ sourceText: 'Unknown product from invoice', stockItemId: null, descriptionText: null, catalogNoText: null, matchMethod: 'unmatched', expectedQty: 1 })
  })
})
