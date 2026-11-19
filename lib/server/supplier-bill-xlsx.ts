import 'server-only'
import ExcelJS from 'exceljs'
import { SUPPLIER_BILL_HEADERS, SUPPLIER_BILL_MAX_ROWS } from '@/lib/receiving/supplier-bill'
import { HttpError } from '@/lib/server/errors'

/** Reads worksheet "Bill" (or the first sheet) into a 9-column table, like CHEM-IMMUNO-QMS. */
export async function readSupplierBillTable(bytes: ArrayBuffer): Promise<unknown[][]> {
  let book: ExcelJS.Workbook
  try {
    book = new ExcelJS.Workbook()
    // ExcelJS and newer @types/node disagree on the Buffer generic; the bytes are a real Node Buffer.
    await book.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof book.xlsx.load>[0])
  } catch {
    throw new HttpError(400, 'อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้รูปแบบเดียวกับไฟล์ Bill ตัวอย่าง')
  }
  const sheet = book.getWorksheet('Bill') ?? book.worksheets[0]
  if (!sheet || sheet.rowCount > SUPPLIER_BILL_MAX_ROWS + 1)
    throw new HttpError(400, `ไฟล์ต้องมี Worksheet Bill และรายการไม่เกิน ${SUPPLIER_BILL_MAX_ROWS} แถว`)
  const table: unknown[][] = []
  for (let n = 1; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n)
    table.push(Array.from({ length: 9 }, (_, index) => {
      const cell = row.getCell(index + 1)
      const value = cell.value
      if (value instanceof Date || typeof value === 'number' || typeof value === 'string') return value
      // Formula cells are accepted only when their cached result is scalar.
      if (value && typeof value === 'object' && 'result' in value) {
        const result = value.result
        return result instanceof Date || typeof result === 'number' || typeof result === 'string' ? result : ''
      }
      return cell.text
    }))
  }
  return table
}

/**
 * Blank template in the import format, with one example row and a notes sheet.
 * Date columns are real Excel dates and code columns are text so leading zeros survive.
 */
export async function buildSupplierBillTemplate(): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Bill', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = SUPPLIER_BILL_HEADERS.map((header, index) => ({
    header,
    width: [14, 12, 16, 16, 16, 42, 14, 12, 8][index],
    style: index === 1 || index === 7 ? { numFmt: 'yyyy-mm-dd' } : index === 8 ? { numFmt: '0' } : { numFmt: '@' },
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EFF0' } }
  sheet.addRow(['5346807724', new Date(Date.UTC(2026, 9, 7)), 'consignment', '08056692190', '101002426', 'ตัวอย่างน้ำยา — ลบแถวนี้ก่อนใช้งาน', 'A001', new Date(Date.UTC(2027, 7, 31)), 10])

  const notes = book.addWorksheet('วิธีกรอก')
  notes.columns = [{ width: 18 }, { width: 90 }]
  const rows: [string, string][] = [
    ['คอลัมน์', 'รายละเอียด'],
    ['Bill No.', 'เลขที่ Bill/Invoice ของผู้ขาย — ทั้งไฟล์ต้องเป็น Bill เดียวกัน (ใช้เป็นเลขที่ใบรับเข้า)'],
    ['Bill Date', 'วันที่ Bill — เซลล์วันที่ของ Excel หรือข้อความ YYYY-MM-DD'],
    ['Customer PO', 'เลข PO (ทั้งไฟล์ต้องเป็นเลขเดียวกัน) หรือ consignment / เว้นว่าง'],
    ['RDTH Code', 'REF ของผู้ขาย — ใช้จับคู่กับ Catalog/REF ใน Item Master (เก็บเป็นข้อความเพื่อไม่ให้เลข 0 หน้าหาย)'],
    ['Material No.', 'รหัส Material ของผู้ขาย — ใช้จับคู่สำรองเมื่อ RDTH Code ไม่พบ'],
    ['Description', 'ชื่อสินค้าตาม Bill'],
    ['Lot', 'เลข LOT (ไม่เกิน 100 ตัวอักษร) — LOT เดียวกันหลายแถวจะรวมจำนวนให้'],
    ['Exp. Date', 'วันหมดอายุ — เซลล์วันที่ของ Excel หรือข้อความ YYYY-MM-DD'],
    ['Qty', 'จำนวนเต็ม 1–1,000,000'],
    ['ข้อจำกัด', 'Worksheet ชื่อ Bill · ไม่เกิน 500 แถว · ไฟล์ .xlsx ไม่เกิน 2 MB · รูปแบบเดียวกับ CHEM-IMMUNO-QMS'],
  ]
  for (const row of rows) notes.addRow(row)
  notes.getRow(1).font = { bold: true }
  return (await book.xlsx.writeBuffer()) as ArrayBuffer
}
