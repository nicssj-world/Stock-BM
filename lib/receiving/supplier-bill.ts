// Supplier Bill (.xlsx) import for receiving — same file format as CHEM-IMMUNO-QMS
// (worksheet "Bill", columns: Bill No., Bill Date, Customer PO, RDTH Code,
// Material No., Description, Lot, Exp. Date, Qty). Parsing and matching only:
// nothing here creates receipts or touches stock.

import { normalizeCatalog } from '@/lib/receiving/item-search'

export type SupplierBillRow = {
  excelRow: number
  billNumber: string
  billDate: string
  customerPo: string
  rdthCode: string
  materialNo: string
  description: string
  lot: string
  expiry: string
  quantity: number
}

export type SupplierBill = {
  invoiceNumber: string
  invoiceDate: string
  poNumber: string
  rows: SupplierBillRow[]
}

export const SUPPLIER_BILL_HEADERS = ['Bill No.', 'Bill Date', 'Customer PO', 'RDTH Code',
  'Material No.', 'Description', 'Lot', 'Exp. Date', 'Qty'] as const

export const SUPPLIER_BILL_MAX_ROWS = 500

function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  return ''
}

function isoDate(value: unknown): string | null {
  const input = cellText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null
  const date = new Date(input + 'T00:00:00.000Z')
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? null : input
}

export function parseSupplierBillTable(table: readonly (readonly unknown[])[]):
  { ok: true; bill: SupplierBill } | { ok: false; message: string } {
  if (table.length < 2 || table.length > SUPPLIER_BILL_MAX_ROWS + 1)
    return { ok: false, message: `ไฟล์ต้องมี 1–${SUPPLIER_BILL_MAX_ROWS} แถวรายการ พร้อมหัวตาราง` }
  const header = table[0].slice(0, 9).map(cellText)
  if (SUPPLIER_BILL_HEADERS.some((name, index) => header[index]?.toLowerCase() !== name.toLowerCase()))
    return { ok: false, message: 'หัวตารางต้องมี Bill No., Bill Date, Customer PO, RDTH Code, Material No., Description, Lot, Exp. Date และ Qty ตามตัวอย่าง' }

  const rows: SupplierBillRow[] = []
  for (let n = 1; n < table.length; n++) {
    const data = table[n].slice(0, 9)
    if (data.every((value) => cellText(value) === '')) continue
    const [billNumber, , customerPo, rdthCode, materialNo, description, lot] = data.map(cellText)
    const billDate = isoDate(data[1])
    const expiry = isoDate(data[7])
    const quantityText = cellText(data[8])
    const quantity = Number(quantityText)
    if (!billNumber || billNumber.length > 120 || !billDate || !rdthCode || !materialNo || !description || !lot ||
      lot.length > 100 || !expiry || !/^\d+$/.test(quantityText) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      return { ok: false, message: `ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้องที่ Excel แถว ${n + 1} (Bill, วัน, REF, Material, ชื่อสินค้า, LOT, EXP และจำนวนต้องถูกต้อง)` }
    }
    rows.push({ excelRow: n + 1, billNumber, billDate, customerPo, rdthCode, materialNo, description, lot, expiry, quantity })
  }
  if (!rows.length) return { ok: false, message: 'ไม่พบรายการสินค้าในไฟล์' }
  const first = rows[0]
  if (rows.some((row) => row.billNumber !== first.billNumber || row.billDate !== first.billDate))
    return { ok: false, message: 'ไฟล์มีมากกว่าหนึ่ง Bill No. หรือ Bill Date กรุณาแยกไฟล์' }
  const poValues = [...new Set(rows.map((row) => row.customerPo.trim())
    .filter((value) => value && value.toLowerCase() !== 'consignment'))]
  if (poValues.length > 1 || (poValues.length > 0 && rows.some((row) => row.customerPo.trim().toLowerCase() === 'consignment')))
    return { ok: false, message: 'Customer PO ในไฟล์ไม่ตรงกัน กรุณาตรวจสอบก่อน Import' }
  return { ok: true, bill: { invoiceNumber: first.billNumber, invoiceDate: first.billDate, poNumber: poValues[0] ?? '', rows } }
}

export type SupplierBillItem = { id: string; itemCode: string; catalogNo?: string | null }

/** An approved, remembered Vendor code → Item Master mapping (bm_supplier_item_codes). */
export type SupplierCodeAlias = { codeKind: 'rdth' | 'material'; codeNormalized: string; stockItemId: string }

export function normalizeSupplierCode(value: string | null | undefined) {
  return normalizeCatalog(value)
}

export type SupplierBillMatch =
  | { status: 'matched'; itemId: string; via: 'rdth' | 'material' }
  | { status: 'missing' }
  | { status: 'conflict'; itemIds: string[] }

const stripLeadingZeros = (value: string) => value.replace(/^0+(?=.)/, '')

/**
 * Exact Item Master lookup by Catalog/REF (or item code) plus this Vendor's approved
 * remembered codes. RDTH Code is tried first, then Material No. A code that points
 * to more than one item — or RDTH and Material pointing to different items — is a
 * conflict and is never guessed.
 */
export function matchSupplierBillRow(row: Pick<SupplierBillRow, 'rdthCode' | 'materialNo'>, items: readonly SupplierBillItem[], aliases: readonly SupplierCodeAlias[] = []): SupplierBillMatch {
  const activeIds = new Set(items.map((item) => item.id))
  function lookup(code: string, kind: SupplierCodeAlias['codeKind']): string[] {
    const wanted = normalizeCatalog(code)
    if (!wanted) return []
    const exact = [
      ...items.filter((item) => normalizeCatalog(item.catalogNo) === wanted || normalizeCatalog(item.itemCode) === wanted).map((item) => item.id),
      ...aliases.filter((alias) => alias.codeKind === kind && alias.codeNormalized === wanted && activeIds.has(alias.stockItemId)).map((alias) => alias.stockItemId),
    ]
    if (exact.length) return [...new Set(exact)]
    // Excel often drops (or a REF keeps) leading zeros, e.g. 08056692190 vs 8056692190.
    const loose = stripLeadingZeros(wanted)
    return [...new Set(items.filter((item) => {
      const catalog = normalizeCatalog(item.catalogNo)
      return catalog && stripLeadingZeros(catalog) === loose
    }).map((item) => item.id))]
  }
  const byRef = lookup(row.rdthCode, 'rdth')
  const byMaterial = lookup(row.materialNo, 'material')
  if (byRef.length > 1) return { status: 'conflict', itemIds: byRef }
  if (byMaterial.length > 1 && !byRef.length) return { status: 'conflict', itemIds: byMaterial }
  if (byRef.length === 1 && byMaterial.length === 1 && byRef[0] !== byMaterial[0])
    return { status: 'conflict', itemIds: [byRef[0], byMaterial[0]] }
  if (byRef.length === 1) return { status: 'matched', itemId: byRef[0], via: 'rdth' }
  if (byMaterial.length === 1) return { status: 'matched', itemId: byMaterial[0], via: 'material' }
  return { status: 'missing' }
}

/** One checklist entry per product + LOT; repeated rows of the same LOT are summed. */
export type SupplierBillLot = {
  key: string
  excelRows: number[]
  rdthCode: string
  materialNo: string
  description: string
  lot: string
  expiry: string
  quantity: number
  match: SupplierBillMatch
}

export function groupSupplierBillLots(rows: readonly SupplierBillRow[], items: readonly SupplierBillItem[], aliases: readonly SupplierCodeAlias[] = []):
  { ok: true; lots: SupplierBillLot[] } | { ok: false; message: string } {
  const byKey = new Map<string, SupplierBillLot>()
  for (const row of rows) {
    const match = matchSupplierBillRow(row, items, aliases)
    const productKey = match.status === 'matched' ? `item:${match.itemId}` : `code:${normalizeCatalog(row.rdthCode)}|${normalizeCatalog(row.materialNo)}`
    const key = `${productKey}|lot:${row.lot.trim().toUpperCase()}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { key, excelRows: [row.excelRow], rdthCode: row.rdthCode, materialNo: row.materialNo, description: row.description, lot: row.lot.trim(), expiry: row.expiry, quantity: row.quantity, match })
      continue
    }
    if (existing.expiry !== row.expiry)
      return { ok: false, message: `สินค้า ${row.rdthCode} LOT ${row.lot} มีวันหมดอายุไม่ตรงกันในไฟล์ (แถว ${existing.excelRows[0]} และ ${row.excelRow})` }
    const quantity = existing.quantity + row.quantity
    if (!Number.isSafeInteger(quantity) || quantity > 1_000_000) return { ok: false, message: `จำนวนรวม LOT เกินกำหนดที่แถว ${row.excelRow}` }
    existing.quantity = quantity
    existing.excelRows.push(row.excelRow)
  }
  return { ok: true, lots: [...byKey.values()] }
}

export type SupplierBillImport = {
  fileName: string
  invoiceNumber: string
  invoiceDate: string
  poNumber: string
  rowCount: number
  lots: SupplierBillLot[]
}

export function supplierBillNote(bill: Pick<SupplierBillImport, 'invoiceNumber' | 'invoiceDate' | 'poNumber' | 'fileName'>) {
  return `นำเข้าจาก Excel Bill ${bill.invoiceNumber} · Bill Date ${bill.invoiceDate}${bill.poNumber ? ` · PO ${bill.poNumber}` : ''} · ไฟล์ ${bill.fileName}`.slice(0, 2000)
}
