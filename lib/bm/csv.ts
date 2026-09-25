import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import type { StockWorkspace } from '@/lib/bm/types'
import type { Snapshot } from '@/lib/vendors/evaluation'
import { criterionLabel } from '@/lib/vendors/evaluation'
import { ISSUE_STATUS_LABELS, ISSUE_TYPE_LABELS, type VendorIssue } from '@/lib/vendors/issues'

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`
}

export function buildBalancesCsv(workspace: StockWorkspace) {
  const rows: unknown[][] = [['Item code', 'Item name', 'Category', 'Lot', 'Expiry', 'Location', 'On hand', 'Unit', 'Status']]
  workspace.items.forEach((item) => {
    item.lots.forEach((lot) => {
      lot.balances.forEach((balance) => {
        if (balance.onHand === 0) return
        rows.push([
          item.itemCode,
          item.name,
          item.categoryName,
          lot.lotNumber,
          formatDate(lot.expiryDate),
          `${balance.locationCode} ${balance.locationName}`,
          formatQuantity(balance.onHand),
          item.unit,
          lot.expiryState,
        ])
      })
    })
  })
  return csv(rows)
}

export function buildMovementsCsv(workspace: StockWorkspace) {
  const rows: unknown[][] = [['Date', 'Type', 'Item code', 'Item name', 'Lot', 'Location', 'Quantity', 'Unit', 'Purpose', 'Reference', 'Note', 'User']]
  workspace.transactions.forEach((transaction) => {
    transaction.lines.forEach((line) => {
      rows.push([
        formatDateTime(transaction.createdAt),
        transaction.transactionType,
        line.itemCode,
        line.itemName,
        line.lotNumber,
        line.locationCode,
        formatQuantity(line.quantity),
        line.unit,
        transaction.purpose ?? '',
        transaction.reference ?? '',
        transaction.note ?? '',
        transaction.createdByName ?? '',
      ])
    })
  })
  return csv(rows)
}

export function buildVendorPerformanceCsv(performance: Omit<Snapshot, 'issues' | 'receipts' | 'assessments'>, issues: VendorIssue[]) {
  const rows: unknown[][] = [['ผู้ขาย', 'ปีงบประมาณ (พ.ศ.)', 'เกณฑ์', 'ตัวตั้ง', 'ตัวหาร', 'ผล (%)']]
  for (const criterion of performance.criteria) {
    rows.push([
      `${performance.vendor.vendorCode} · ${performance.vendor.name}`,
      performance.fiscalYear,
      criterionLabel(criterion.criterionCode),
      criterion.numerator,
      criterion.applicable ? criterion.denominator : 'N/A',
      criterion.percentage == null ? 'N/A' : criterion.percentage,
    ])
  }
  rows.push([])
  rows.push(['ช่วงข้อมูล', performance.coverage.startDate, performance.coverage.endDate, 'ตรวจรับแล้ว', performance.coverage.completed, 'ค้างประเมิน', performance.coverage.pending])
  rows.push(['ตัวเลขนี้เป็นข้อมูลสด ไม่ใช่คะแนนอย่างเป็นทางการ'])
  rows.push([])
  rows.push(['รหัสปัญหา', 'ประเภท', 'สถานะ', 'เปิดเมื่อ', 'รายละเอียด', 'หมายเหตุการแก้ไข'])
  for (const issue of issues) {
    rows.push([issue.id, ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType, ISSUE_STATUS_LABELS[issue.status] ?? issue.status, issue.openedAt, issue.description, issue.resolutionNote ?? ''])
  }
  return csv(rows)
}
