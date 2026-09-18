import { describe, expect, it } from 'vitest'
import { buildInvoiceOcrDraftLines, classifyInvoiceOcrText, type InvoiceOcrItem } from './invoice-ocr-draft'

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

  it('keeps unresolved OCR separate from candidate review and excludes document noise', () => {
    const classified = classifyInvoiceOcrText([
      'Unknown Thai reagent description',
      'สำเนาใบส่งสินค้า',
      'Shipping charge 120',
      'VAT 7%',
      'ABC-123 Qty: 4 LOT: L-01 EXP: 2027-12-31',
    ].join('\n'), items)

    expect(classified.candidateLines).toHaveLength(1)
    expect(classified.candidateLines[0]).toMatchObject({ sourceText: 'ABC-123 Qty: 4 LOT: L-01 EXP: 2027-12-31', stockItemId: 'item-1' })
    expect(classified.unresolvedLines.map((line) => line.sourceText)).toContain('Unknown Thai reagent description')
    expect(classified.ignoredLines.map((line) => line.sourceText)).toEqual(expect.arrayContaining(['สำเนาใบส่งสินค้า', 'Shipping charge 120', 'VAT 7%']))
    expect(buildInvoiceOcrDraftLines('Unknown Thai reagent description', items)).toEqual([])
  })

  it('retains catalog-like numeric evidence such as 1011 and 090 without inventing an Item Master name', () => {
    const catalogItems: InvoiceOcrItem[] = [
      { itemId: 'item-1011', catalogNo: '101154997', itemCode: 'BM-1011', name: 'Master 1011 item', manufacturer: 'Acme', vendor: 'Vendor' },
    ]
    const classified = classifyInvoiceOcrText('101154997 Qty: 2\n090998877 Qty: 1\nUnknown Thai description', catalogItems)
    expect(classified.candidateLines).toHaveLength(1)
    expect(classified.candidateLines[0]).toMatchObject({ catalogNoText: '101154997', descriptionText: 'Master 1011 item' })
    expect(classified.unresolvedLines.some((line) => line.sourceText.startsWith('090998877'))).toBe(true)
    expect(classified.unresolvedLines.some((line) => line.sourceText === 'Unknown Thai description')).toBe(true)
  })
})
