// Single source for metric names shown on screen, in print and in CSV. Older
// frozen evaluation snapshots may carry the pre-assessment keys, so those
// labels stay resolvable too.
export const VENDOR_METRIC_LABELS: Record<string, string> = {
  complete_delivery: 'Complete Delivery',
  shelf_life_compliance: 'Shelf-life compliance (TOR)',
  product_condition: 'สภาพสินค้า/บรรจุภัณฑ์ปกติ',
  documentation_compliance: 'เอกสารประกอบครบ/ถูกต้อง',
  item_correctness: 'สินค้าที่ได้รับถูกต้อง',
  cold_chain_condition: 'Cold chain: สภาพ/อุณหภูมิเหมาะสม',
  assessment_complaints: 'ปัญหา/ข้อร้องเรียนจากการประเมินรับ',
  documentation_discrepancies: 'Documentation discrepancy issues',
  complaint_resolution: 'Complaint resolution',
  packaging_compliance: 'Packaging compliance (legacy snapshot)',
  temperature_compliance: 'Temperature compliance (legacy snapshot)',
}

export function vendorMetricLabel(key: string) {
  return VENDOR_METRIC_LABELS[key] ?? key
}

export const METRIC_EXCLUSION_LABELS: Record<string, string> = {
  still_open: 'ยังเปิดอยู่',
  cancelled: 'ยกเลิก',
  assessment_pending: 'รอประเมิน (Pending)',
  cold_chain_not_applicable: 'ไม่เกี่ยวข้อง cold chain',
  not_applicable: 'ไม่เกี่ยวข้อง',
  not_recorded: 'ไม่ได้บันทึก',
}
