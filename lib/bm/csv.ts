import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import type { StockWorkspace } from '@/lib/bm/types'
import type { VendorPerformance } from '@/lib/vendors/types'

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

export function buildVendorPerformanceCsv(performance: VendorPerformance) {
  const rows: unknown[][] = [['Vendor', 'Fiscal year', 'Metric', 'Numerator', 'Denominator', 'Percent', 'Applicable population', 'Provisional']]
  const labels: Record<string, string> = {
    complete_delivery: 'Complete delivery',
    shelf_life_compliance: 'Shelf-life compliance',
    packaging_compliance: 'Packaging compliance',
    temperature_compliance: 'Temperature compliance',
    documentation_discrepancies: 'Documentation discrepancies',
    complaint_resolution: 'Complaint resolution',
  }
  for (const metric of Object.values(performance.metrics.metrics)) {
    rows.push([
      `${performance.vendor.code} · ${performance.vendor.name}`,
      performance.fiscalYear,
      labels[metric.key] ?? metric.key,
      metric.numerator,
      metric.denominator ?? '',
      metric.percent == null ? '' : metric.percent.toFixed(1),
      metric.applicablePopulation,
      metric.provisional ? 'yes' : 'no',
    ])
  }
  rows.push([])
  rows.push(['Delivery Lead Time', performance.metrics.deliveryLeadTime.sampleSize, performance.metrics.deliveryLeadTime.meanDays ?? '', performance.metrics.deliveryLeadTime.medianDays ?? '', performance.metrics.deliveryLeadTime.label])
  rows.push([])
  rows.push(['Issue ID', 'Issue type', 'Status', 'Opened at', 'Description', 'Resolution note'])
  for (const issue of performance.issues) {
    rows.push([issue.id, issue.issueType, issue.resolutionStatus, issue.openedAt, issue.description, issue.resolutionNote ?? ''])
  }
  return csv(rows)
}

