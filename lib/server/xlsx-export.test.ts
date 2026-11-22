import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { addKeyValueSheet, addTableSheet, excelDate, newWorkbook, xlsxResponse } = await import('@/lib/server/xlsx-export')

describe('xlsx export helpers', () => {
  it('shifts timestamps to Bangkok wall-clock time for Excel', () => {
    // 2026-11-01 02:30 UTC is 09:30 in Bangkok.
    expect(excelDate('2026-11-01T02:30:00Z')?.toISOString()).toBe('2026-11-01T09:30:00.000Z')
    // Date-only values land on midnight of the same calendar day.
    expect(excelDate('2026-11-22')?.toISOString()).toBe('2026-11-22T00:00:00.000Z')
    expect(excelDate(null)).toBeNull()
    expect(excelDate('not a date')).toBeNull()
  })

  it('writes a table sheet with a header row and Thai text that reads back intact', async () => {
    const book = newWorkbook()
    addKeyValueSheet(book, 'Summary', [['หัวข้อ', 'เปรียบเทียบเครื่อง cobas'], ['n', 20]])
    addTableSheet(book, 'Pairs', [
      { header: '#', value: (row: { n: number; label: string | null }) => row.n },
      { header: 'ตัวอย่าง', value: (row) => row.label },
    ], [{ n: 1, label: 'S001' }, { n: 2, label: null }])

    const response = await xlsxResponse(book, 'รายงาน_test.xlsx')
    expect(response.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(response.headers.get('Content-Disposition')).toContain("filename*=UTF-8''")

    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(await response.arrayBuffer())
    expect(loaded.getWorksheet('Summary')?.getCell('B1').value).toBe('เปรียบเทียบเครื่อง cobas')
    const pairs = loaded.getWorksheet('Pairs')
    expect(pairs?.getRow(1).values).toEqual([undefined, '#', 'ตัวอย่าง'])
    expect(pairs?.getCell('A3').value).toBe(2)
    expect(pairs?.getCell('B3').value).toBeNull()
  })
})
