import { formatDateTime, formatQuantity } from '@/lib/bm/rules'
import type { BmActor, StockWorkspace } from '@/lib/bm/types'

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, '?')
}

function pdfText(value: string) {
  return ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

export function buildStockSummaryPdf(workspace: StockWorkspace, actor: BmActor) {
  const lines = [
    'BM Stock Summary',
    `Printed: ${new Date().toISOString()}`,
    `Printed by: ${actor.displayName} (${actor.ephisId})`,
    `Active items: ${workspace.activeItemCount}   Low stock: ${workspace.lowStockItemCount}   Expiring: ${workspace.expiringLotCount}   Expired: ${workspace.expiredLotCount}`,
    '',
    'Low stock / expiring items',
    ...workspace.items
      .filter((item) => item.isLowStock || item.lots.some((lot) => lot.totalOnHand > 0 && (lot.expiryState === 'expired' || lot.expiryState === 'expiring')))
      .slice(0, 42)
      .map((item) => `${item.itemCode}  ${item.name}  on hand ${formatQuantity(item.usableOnHand)} ${item.unit}  min ${formatQuantity(item.minimumStock)}`),
    '',
    'Recent transactions',
    ...workspace.transactions
      .slice(0, 18)
      .map((tx) => `${formatDateTime(tx.createdAt)}  ${tx.transactionType}  ${tx.lines[0]?.itemCode ?? '-'}  ${tx.createdByName ?? '-'}`),
  ]

  const content = [
    'BT',
    '/F1 14 Tf',
    '40 800 Td',
    ...lines.flatMap((line, index) => {
      const font = index === 0 ? ['/F1 18 Tf'] : index === 5 ? ['/F1 13 Tf'] : ['/F1 9 Tf']
      return [...font, `(${pdfText(line)}) Tj`, '0 -16 Td']
    }),
    'ET',
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'utf8'))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(body, 'utf8')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body, 'utf8')
}

