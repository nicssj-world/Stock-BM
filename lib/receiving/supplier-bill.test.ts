import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import { groupSupplierBillLots, matchSupplierBillRow, parseSupplierBillTable, SUPPLIER_BILL_HEADERS } from '@/lib/receiving/supplier-bill'

vi.mock('server-only', () => ({}))

const example = (lot: string, qty: unknown, ref = '08056692190', expiry: unknown = '2027-08-31') =>
  ['5346807724', '2026-10-07', 'consignment', ref, '101002426', 'Test reagent', lot, expiry, qty]
const sample = (rows: unknown[][]) => parseSupplierBillTable([[...SUPPLIER_BILL_HEADERS], ...rows])

const items = [
  { id: 'a', itemCode: 'BM-001', catalogNo: '08056692190' },
  { id: 'b', itemCode: 'BM-002', catalogNo: '07007302190' },
  { id: 'c', itemCode: 'BM-003', catalogNo: '101002426' },
]

describe('parseSupplierBillTable (CHEM-IMMUNO Bill format)', () => {
  it('parses the bill header and treats consignment as no PO', () => {
    const result = sample([example('A001', 10), example('B002', 5)])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bill).toMatchObject({ invoiceNumber: '5346807724', invoiceDate: '2026-10-07', poNumber: '' })
    expect(result.bill.rows).toHaveLength(2)
    expect(result.bill.rows[0]).toMatchObject({ excelRow: 2, rdthCode: '08056692190', lot: 'A001', quantity: 10 })
  })

  it('accepts Date cells and skips blank rows', () => {
    const result = sample([example('A001', 3, '08056692190', new Date('2027-01-31T00:00:00Z')), Array(9).fill('')])
    expect(result.ok && result.bill.rows[0].expiry).toBe('2027-01-31')
  })

  it('rejects wrong headers, bad quantity, invalid dates, and mixed bills or POs', () => {
    expect(parseSupplierBillTable([['Bill', 'Date'], example('A', 1)]).ok).toBe(false)
    expect(sample([example('A001', 0)]).ok).toBe(false)
    expect(sample([example('A001', '1.5')]).ok).toBe(false)
    expect(sample([example('A001', 1, '0805', '2027-02-30')]).ok).toBe(false)
    const other = example('B', 1); other[0] = '999'
    expect(sample([example('A', 1), other])).toMatchObject({ ok: false, message: expect.stringContaining('มากกว่าหนึ่ง Bill') })
    const po1 = example('A', 1); po1[2] = 'PO-1'
    const po2 = example('B', 1); po2[2] = 'PO-2'
    expect(sample([po1, po2]).ok).toBe(false)
    po2[2] = 'PO-1'
    expect(sample([po1, po2])).toMatchObject({ ok: true, bill: { poNumber: 'PO-1' } })
  })
})

describe('matchSupplierBillRow', () => {
  it('matches by RDTH Code, falling back to Material No., and tolerates lost leading zeros', () => {
    expect(matchSupplierBillRow({ rdthCode: '08056692190', materialNo: 'x' }, items)).toEqual({ status: 'matched', itemId: 'a', via: 'rdth' })
    expect(matchSupplierBillRow({ rdthCode: '8056692190', materialNo: 'x' }, items)).toEqual({ status: 'matched', itemId: 'a', via: 'rdth' })
    expect(matchSupplierBillRow({ rdthCode: '999', materialNo: '101002426' }, items)).toEqual({ status: 'matched', itemId: 'c', via: 'material' })
    expect(matchSupplierBillRow({ rdthCode: '999', materialNo: '888' }, items)).toEqual({ status: 'missing' })
  })

  it('never guesses when codes point to different or duplicate items', () => {
    expect(matchSupplierBillRow({ rdthCode: '08056692190', materialNo: '101002426' }, items).status).toBe('conflict')
    const dup = [...items, { id: 'd', itemCode: 'BM-004', catalogNo: '0805-6692190' }]
    expect(matchSupplierBillRow({ rdthCode: '08056692190', materialNo: 'x' }, dup).status).toBe('conflict')
  })
})

describe('remembered supplier codes', () => {
  const aliases = [{ codeKind: 'rdth' as const, codeNormalized: 'X123', stockItemId: 'b' }]
  it('matches an approved remembered RDTH code', () => {
    expect(matchSupplierBillRow({ rdthCode: 'x-123', materialNo: '' }, items, aliases)).toEqual({ status: 'matched', itemId: 'b', via: 'rdth' })
  })
  it('does not let a code kind stand in for the other kind', () => {
    expect(matchSupplierBillRow({ rdthCode: '', materialNo: 'X123' }, items, aliases).status).toBe('missing')
  })
  it('flags a remembered code that disagrees with the Item Master REF', () => {
    const clash = [{ codeKind: 'rdth' as const, codeNormalized: '08056692190', stockItemId: 'b' }]
    expect(matchSupplierBillRow({ rdthCode: '08056692190', materialNo: '' }, items, clash).status).toBe('conflict')
  })
  it('ignores mappings to inactive items', () => {
    expect(matchSupplierBillRow({ rdthCode: 'X123', materialNo: '' }, items, [{ ...aliases[0], stockItemId: 'gone' }]).status).toBe('missing')
  })
})

describe('groupSupplierBillLots', () => {
  it('groups the same item + LOT and sums quantity; keeps different LOTs separate', () => {
    const parsed = sample([example('A001', 10), example('B002', 5), example('a001', 2)])
    if (!parsed.ok) throw new Error(parsed.message)
    const grouped = groupSupplierBillLots(parsed.bill.rows, items)
    if (!grouped.ok) throw new Error(grouped.message)
    expect(grouped.lots.map((lot) => [lot.lot, lot.quantity, lot.excelRows])).toEqual([['A001', 12, [2, 4]], ['B002', 5, [3]]])
  })

  it('rejects one LOT with two expiry dates', () => {
    const parsed = sample([example('A001', 1), example('A001', 1, '08056692190', '2028-01-01')])
    if (!parsed.ok) throw new Error(parsed.message)
    expect(groupSupplierBillLots(parsed.bill.rows, items).ok).toBe(false)
  })
})

describe('buildSupplierBillTemplate', () => {
  it('produces a workbook the importer accepts, keeping leading zeros', async () => {
    const { buildSupplierBillTemplate, readSupplierBillTable } = await import('@/lib/server/supplier-bill-xlsx')
    const parsed = parseSupplierBillTable(await readSupplierBillTable(await buildSupplierBillTemplate()))
    expect(parsed).toMatchObject({ ok: true, bill: { invoiceNumber: '5346807724', invoiceDate: '2026-10-07', rows: [{ rdthCode: '08056692190', expiry: '2027-08-31', quantity: 10 }] } })
  })
})

describe('readSupplierBillTable', () => {
  it('reads a real .xlsx Bill worksheet end to end', async () => {
    const { readSupplierBillTable } = await import('@/lib/server/supplier-bill-xlsx')
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Bill')
    sheet.addRow([...SUPPLIER_BILL_HEADERS])
    sheet.addRow(['5346807724', '2026-10-07', 'consignment', '08056692190', '101002426', 'Test reagent', 'A001', new Date('2027-08-31T00:00:00Z'), 10])
    const bytes = await book.xlsx.writeBuffer()
    const table = await readSupplierBillTable(new Uint8Array(bytes as ArrayBuffer).buffer)
    const parsed = parseSupplierBillTable(table)
    expect(parsed).toMatchObject({ ok: true, bill: { invoiceNumber: '5346807724', rows: [{ expiry: '2027-08-31', quantity: 10 }] } })
  })
})
