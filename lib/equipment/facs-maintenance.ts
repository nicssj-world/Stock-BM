export const FACS_DAILY_TASKS = [
  'ตรวจสอบปริมาณของเหลวในถัง',
  'Purge Sheath Filter (Optional)',
  'Daily Clean ก่อนการใช้งาน',
  'Performance QC',
  'Assay and tube setting set up',
  'Daily Clean หลังการใช้งาน',
  'Shutdown',
] as const

export const FACS_MONTHLY_TASKS = [
  'Monthly Clean > เทของเสียในถัง Waste ทิ้ง',
  'เปลี่ยน Sheath filter เป็น Bypass',
  'เปลี่ยนสาย Sheath ใส่ลงในถัง FACSClean',
  'ใส่ 2 ml FACSClean ที่ Manual port > Continue',
  'เปลี่ยนสาย Sheath กลับลงในถัง Sheath',
  'ใส่ 3 ml DI water ที่ Manual port > Continue',
  'เปลี่ยน Bypass กลับเป็น Sheath filter',
  'Purge Sheath Filter',
] as const

export type FacsMaintenanceFrequency = 'daily' | 'monthly'
export type FacsTaskState = 'done' | 'not-applicable' | 'not-done'
export type FacsTaskResult = { state: FacsTaskState; note?: string }

export type FacsMaintenanceEntry = {
  id: string
  equipmentId: string
  frequency: FacsMaintenanceFrequency
  performedOn: string
  taskResults: FacsTaskResult[]
  note: string | null
  operatorName: string
  operatorCode: string
  createdAt: string
}

export type FacsMaintenanceReview = { id: string; frequency: FacsMaintenanceFrequency; period: string; reviewedByName: string; reviewedAt: string }
export type FacsMaintenanceWorkspace = {
  equipment: { id: string; code: string; name: string } | null
  entries: FacsMaintenanceEntry[]
  holidays: { date: string; note: string | null }[]
  reviews: FacsMaintenanceReview[]
  reviewerId: string | null
  users: { id: string; displayName: string }[]
  today: string
}
