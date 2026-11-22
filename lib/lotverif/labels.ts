import type { LotVerification, LotVerifParallelSummary, LotVerifStatus } from '@/lib/lotverif/types'

export const LOTVERIF_STATUS_LABEL: Record<LotVerifStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังทำ',
  passed: 'ผ่าน',
  failed: 'ไม่ผ่าน',
  released: 'อนุมัติใช้',
  rejected: 'ปฏิเสธ',
}

export const LOTVERIF_METHOD_LABEL: Record<LotVerification['method'], string> = {
  'parallel-comparison': 'Parallel comparison (เทียบผลเดิม/ใหม่)',
  'qc-acceptance': 'QC acceptance (ประเมินผล QC)',
  'patient-comparison': 'Patient comparison (เทียบตัวอย่างผู้ป่วย)',
}

export function parallelReasonLabel(reason: LotVerifParallelSummary['reason']) {
  if (reason === 'insufficient-levels') return 'ต้องมีข้อมูลอย่างน้อย 2 level'
  if (reason === 'incomplete-level') return 'ผลเดิม/ผลใหม่ของบาง level ไม่ครบ'
  if (reason === 'invalid-control-stats') return 'Mean/SD ของ Control ไม่ถูกต้อง'
  if (reason === 'invalid-log-value') return 'ค่า Viral load ต้องมากกว่า 0'
  if (reason === 'invalid-denominator') return 'ตัวหารคำนวณไม่ได้หรือเป็นศูนย์'
  if (reason === 'invalid-criteria') return 'เกณฑ์ไม่ถูกต้อง'
  return 'คำนวณแล้ว'
}

export function lotVerifSubjectLabel(kind: LotVerification['subjectKind']) {
  return kind === 'reagent-lot' ? 'Reagent lot' : 'Control lot'
}
