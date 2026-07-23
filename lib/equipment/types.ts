import type { StockLocation } from '@/lib/bm/types'

export type EquipmentStatus = 'active' | 'maintenance' | 'out_of_service' | 'decommissioned'
export type EquipmentPlanType = 'pm' | 'calibration' | 'verification' | 'qualification' | 'inspection_safety'
export type EquipmentEventType = EquipmentPlanType | 'repair' | 'software_firmware' | 'relocation' | 'other'
export type EquipmentIntervalUnit = 'day' | 'week' | 'month' | 'year'
export type EquipmentScheduleBasis = 'completion_based' | 'fixed_schedule'
export type EquipmentDueState = 'normal' | 'due_soon' | 'overdue'
export type EquipmentRecordStatus = 'pending' | 'approved' | 'rejected' | 'voided'
export type EquipmentOutcome = 'pass' | 'conditional' | 'fail'

export interface EquipmentAttachment {
  id: string
  entityType: string
  entityId: string | null
  kind: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  createdAt: string
}

export interface Equipment {
  id: string
  code: string
  name: string
  category: string | null
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  assetNumber: string | null
  locationId: string | null
  location: string | null
  installedOn: string | null
  warrantyUntil: string | null
  status: EquipmentStatus
  qrToken: string
  note: string | null
  createdAt: string
  photos: EquipmentAttachment[]
}

export interface EquipmentPlan {
  id: string
  equipmentId: string
  activityType: EquipmentPlanType
  title: string
  intervalValue: number
  intervalUnit: EquipmentIntervalUnit
  scheduleBasis: EquipmentScheduleBasis
  nextDueOn: string
  reminderDays: number
  lastCompletedOn: string | null
  vendor: string | null
  instruction: string | null
  isActive: boolean
  dueState: EquipmentDueState
}

export interface EquipmentServiceRecord {
  id: string
  equipmentId: string
  planId: string | null
  eventType: EquipmentEventType
  otherEventLabel: string | null
  qualificationStage: 'IQ' | 'OQ' | 'PQ' | null
  status: EquipmentRecordStatus
  source: 'internal' | 'public_qr'
  performedOn: string
  reportedProblem: string | null
  findings: string | null
  actionTaken: string
  partsReplaced: string | null
  jobNumber: string | null
  company: string | null
  technicianName: string
  technicianContact: string | null
  receiverName: string | null
  downtimeFrom: string | null
  downtimeUntil: string | null
  outcome: EquipmentOutcome
  returnStatus: Exclude<EquipmentStatus, 'decommissioned'>
  nextRecommendedOn: string | null
  submittedAt: string
  reviewedByName: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  voidReason: string | null
  attachments: EquipmentAttachment[]
}

export interface EquipmentModuleLink {
  id: string
  equipmentId: string
  module: 'iqc' | 'eqa'
  entityType: 'instrument' | 'scheme'
  entityId: string
  entityLabel: string
}

export interface EquipmentTechnician {
  id: string
  equipmentId: string
  technicianName: string
  company: string | null
  phone: string | null
  createdAt: string
}

export interface EquipmentDashboard {
  active: number
  maintenance: number
  outOfService: number
  dueSoon: number
  overdue: number
  pending: number
}

export interface EquipmentWorkspace {
  equipment: Equipment[]
  plans: EquipmentPlan[]
  records: EquipmentServiceRecord[]
  links: EquipmentModuleLink[]
  technicians: EquipmentTechnician[]
  iqcInstruments: { id: string; code: string; name: string }[]
  eqaSchemes: { id: string; code: string | null; name: string }[]
  locations: StockLocation[]
  dashboard: EquipmentDashboard
}

export interface PublicEquipmentContext {
  equipment: Pick<Equipment, 'code' | 'name' | 'category' | 'manufacturer' | 'model' | 'serialNumber' | 'status'>
  plans: Pick<EquipmentPlan, 'id' | 'activityType' | 'title' | 'nextDueOn' | 'dueState'>[]
  technicians: Pick<EquipmentTechnician, 'id' | 'technicianName' | 'company' | 'phone'>[]
}
