import 'server-only'
import ExcelJS from 'exceljs'
import { respond } from '@/lib/server/route'

export type XlsxCell = string | number | boolean | Date | null | undefined

export interface XlsxColumn<T> {
  header: string
  width?: number
  /** Excel number format, e.g. '0.000' or 'yyyy-mm-dd hh:mm'. */
  numFmt?: string
  value: (row: T) => XlsxCell
}

export function newWorkbook() {
  const book = new ExcelJS.Workbook()
  book.creator = 'Molecular-CBH QMS'
  book.created = new Date()
  return book
}

/** Adds a sheet with a bold frozen header row and an autofilter over the data. */
export function addTableSheet<T>(book: ExcelJS.Workbook, name: string, columns: XlsxColumn<T>[], rows: T[]) {
  const sheet = book.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = columns.map((column) => ({ header: column.header, width: column.width ?? Math.max(12, column.header.length + 2), style: column.numFmt ? { numFmt: column.numFmt } : {} }))
  for (const row of rows) sheet.addRow(columns.map((column) => column.value(row) ?? null))
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EFF0' } }
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } }
  return sheet
}

/** Adds a two-column "field / value" sheet, used for study or report headers. */
export function addKeyValueSheet(book: ExcelJS.Workbook, name: string, entries: [string, XlsxCell][]) {
  const sheet = book.addWorksheet(name.slice(0, 31))
  sheet.columns = [{ width: 32 }, { width: 70 }]
  for (const [key, value] of entries) {
    const row = sheet.addRow([key, value ?? null])
    row.getCell(1).font = { bold: true }
  }
  return sheet
}

/** ISO timestamp → JS Date (Excel stores it as a real date cell); null passes through. */
export function excelDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+07:00` : value)
  if (Number.isNaN(date.getTime())) return null
  // Excel has no time zone; shift so the cell shows Bangkok wall-clock time.
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
}

function asciiFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_') || 'export.xlsx'
}

export async function xlsxResponse(book: ExcelJS.Workbook, fileName: string) {
  const bytes = await book.xlsx.writeBuffer()
  return new Response(bytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Runs an export handler; errors come back as the usual JSON error response. */
export async function exportOrError(handler: () => Promise<Response>) {
  try {
    return await handler()
  } catch (error) {
    return respond(async () => { throw error })
  }
}

export function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}
