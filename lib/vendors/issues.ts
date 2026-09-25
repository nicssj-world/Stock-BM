// Vendor issue vocabulary and record shape, ported from LABCBH-Stock lib/vendor-evaluation (schema.ts, presenter.ts).

export const VENDOR_ISSUE_TYPES = ['packaging_damage', 'documentation_discrepancy', 'temperature_out_of_range', 'complaint', 'quantity_discrepancy', 'expiry_non_compliant', 'item_discrepancy', 'other'] as const
export type VendorIssueType = (typeof VENDOR_ISSUE_TYPES)[number]
export const ISSUE_RESOLUTION_ACTIONS = ['vendor_replaced_goods', 'vendor_supplied_documents', 'vendor_clarified_accepted', 'credit_note_received', 'verified_no_impact', 'vendor_warned', 'other'] as const
export const ISSUE_MANUAL_CANCEL_REASONS = ['duplicate', 'opened_in_error', 'other'] as const

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  packaging_damage: 'สภาพสินค้า / บรรจุภัณฑ์',
  documentation_discrepancy: 'เอกสารไม่ครบหรือไม่ถูกต้อง',
  temperature_out_of_range: 'อุณหภูมิไม่เหมาะสม',
  complaint: 'ข้อร้องเรียน',
  quantity_discrepancy: 'จำนวนส่งมอบไม่ครบ',
  expiry_non_compliant: 'อายุสินค้าไม่เป็นไปตามเกณฑ์',
  item_discrepancy: 'รายการสินค้าไม่ถูกต้อง',
  other: 'ปัญหาอื่น',
}
export const ISSUE_SOURCE_LABELS: Record<string, string> = {
  assessment: 'ผลตรวจรับ',
  receipt_line: 'รายการรับเข้า',
  invoice_closure: 'ปิด Invoice แบบรับไม่ครบ',
  manual: 'บันทึกโดยเจ้าหน้าที่',
}
export const ISSUE_RESOLUTION_LABELS: Record<string, string> = {
  vendor_replaced_goods: 'ผู้ขายเปลี่ยนสินค้า',
  vendor_supplied_documents: 'ผู้ขายส่งเอกสารเพิ่มเติม',
  vendor_clarified_accepted: 'ผู้ขายชี้แจงและยอมรับได้',
  credit_note_received: 'ได้รับใบลดหนี้',
  verified_no_impact: 'ตรวจสอบแล้วไม่มีผลกระทบ',
  vendor_warned: 'แจ้งเตือนผู้ขายแล้ว',
  other: 'การแก้ไขอื่น',
}
export const ISSUE_CANCEL_REASON_LABELS: Record<string, string> = {
  duplicate: 'รายการซ้ำ',
  opened_in_error: 'เปิดรายการผิด',
  other: 'เหตุผลอื่น',
  assessment_corrected: 'แก้ไขผลตรวจรับแล้ว (ยกเลิกอัตโนมัติ)',
  invoice_reopened: 'Invoice ถูกเปิดใหม่ (ยกเลิกอัตโนมัติ)',
}
export const ISSUE_STATUS_LABELS: Record<string, string> = { open: 'รอดำเนินการ', resolved: 'แก้ไขแล้ว', cancelled: 'ยกเลิก' }

export type VendorIssueStatus = 'open' | 'resolved' | 'cancelled'

export interface VendorIssue {
  id: string
  vendorId: string
  invoiceId: string | null
  receiptId: string | null
  issueType: VendorIssueType
  sourceKind: 'assessment' | 'receipt_line' | 'invoice_closure' | 'manual'
  description: string
  status: VendorIssueStatus
  resolutionAction: string | null
  resolutionNote: string | null
  cancelledReason: string | null
  cancelledNote: string | null
  openedAt: string
  resolvedAt: string | null
  cancelledAt: string | null
}
