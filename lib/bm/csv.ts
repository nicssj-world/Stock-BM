import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import type { StockWorkspace } from '@/lib/bm/types'

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

