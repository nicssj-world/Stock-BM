import type { Receipt } from '@/lib/receiving/types'

type QuantityLine = { expectedQty: number | null; receivedQty: number }

export function receiptIssues(receipt: Receipt, options: { expiryExceptionEnabled?: boolean } = {}) {
  const issues: { message: string; target: string }[] = []
  if (!receipt.lines.length) issues.push({ message: 'ต้องมีรายการรับเข้าอย่างน้อย 1 รายการ', target: 'lines' })
  if (!receipt.packagingStatus) issues.push({ message: 'กรุณาระบุสภาพบรรจุภัณฑ์', target: 'packagingStatus' })
  if (!receipt.temperatureStatus) issues.push({ message: 'กรุณาระบุสถานะอุณหภูมิ', target: 'temperatureStatus' })
  if (receipt.status !== 'draft') issues.push({ message: 'ใบรับเข้านี้ไม่อยู่ในสถานะร่าง', target: 'status' })

  receipt.lines.forEach((line, index) => {
    const target = `lines.${index}`
    if (!line.stockItemId) issues.push({ message: 'กรุณาเลือก item', target: `${target}.stockItemId` })
    if (!line.locationId) issues.push({ message: 'กรุณาเลือก location', target: `${target}.locationId` })
    if (!Number.isFinite(line.receivedQty) || line.receivedQty <= 0) issues.push({ message: 'จำนวนรับต้องมากกว่า 0', target: `${target}.receivedQty` })
    if (line.conflicts.length) issues.push({ message: 'ต้องแก้ไขข้อมูลที่ขัดแย้งก่อนยืนยัน', target: `${target}.conflicts` })
    if (line.torThresholdMonths !== 6) issues.push({ message: 'เกณฑ์ TOR ต้องเป็น 6 เดือนตามนโยบายกลาง', target: `${target}.torThresholdMonths` })
    if (line.torExpiryCompliance === 'not_compliant') {
      if (!options.expiryExceptionEnabled) {
        issues.push({ message: 'ยังไม่เปิดใช้งานการรับสินค้าที่ไม่ผ่านเกณฑ์ TOR — รออนุมัติผู้มีสิทธิ์ (P-01/P-02)', target: `${target}.receiptDecision` })
      } else if (line.receiptDecision !== 'accepted_with_justification') {
        issues.push({ message: 'กรุณาระบุเหตุผลการยอมรับสินค้าที่ไม่ผ่านเกณฑ์ TOR', target: `${target}.receiptDecision` })
      } else if (!line.acceptanceReasonCode) {
        issues.push({ message: 'กรุณาเลือกเหตุผลการยอมรับ', target: `${target}.acceptanceReasonCode` })
      } else if (line.acceptanceReasonCode === 'other' && !line.acceptanceReasonNote?.trim()) {
        issues.push({ message: 'กรุณาระบุหมายเหตุสำหรับเหตุผลอื่น ๆ', target: `${target}.acceptanceReasonNote` })
      }
    }
  })
  return issues
}

export function receiptReadiness(receipt: Receipt, options: { expiryExceptionEnabled?: boolean } = {}) {
  return receiptIssues(receipt, options).map((issue) => issue.message)
}

export function detectConflicts(lines: QuantityLine[]) {
  return lines.flatMap((line, index) => {
    if (line.expectedQty != null && line.receivedQty > line.expectedQty) {
      return [{ code: 'over_received', message: 'รับเกินจำนวนที่คาดไว้', target: `lines.${index}.receivedQty` }]
    }
    return []
  })
}

export function cumulativeReceived(lines: Array<{ receivedQty: number }>) {
  return lines.reduce((total, line) => total + (Number.isFinite(line.receivedQty) ? line.receivedQty : 0), 0)
}

export function deliveryCompleteness(expectedQty: number, receivedQty: number): 'open' | 'complete' {
  return expectedQty > 0 && receivedQty >= expectedQty ? 'complete' : 'open'
}

export function deliveryLeadTimeDays(invoiceDate: string | null, receivedDate: string | null) {
  if (!invoiceDate || !receivedDate) return null
  const invoice = Date.parse(`${invoiceDate}T00:00:00Z`)
  const received = Date.parse(`${receivedDate}T00:00:00Z`)
  if (!Number.isFinite(invoice) || !Number.isFinite(received)) return null
  return Math.floor((received - invoice) / 86400000)
}
