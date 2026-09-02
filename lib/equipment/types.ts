import type { StockLocation } from '@/lib/bm/types'

export type EquipmentStatus = 'active' | 'maintenance' | 'out_of_service' | 'decommissioned'
export type EquipmentPlanType = 'pm' | 'calibration' | 'verification' | 'qualification' | 'inspection_safety'
export type EquipmentEventType = EquipmentPlanType | 'repair' | 'software_firmware' | 'relocation' | 'other'
export type EquipmentIntervalUnit = 'day' | 'week' | 'month' | 'year'
export type EquipmentScheduleBasis = 'completion_based' | 'fixed_schedule'
export type EquipmentDueState = 'normal' | 'due_soon' | 'overdue'
export type EquipmentRecordStatus = 'pending' | 'approved' | 'rejected' | 'voided'
export type EquipmentOutcome = 'pass' | 'conditional' | 'fail'
export type EquipmentSyncState = 'unlinked' | 'linked' | 'issue' | 'archived'

export interface EquipmentSnapshot {
  portalEquipmentId: string | null
  portalDepartmentCode: string | null
  portalDepartmentName: string | null
  code: string
  name: string
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  assetNumber: string | null
  portalStatus: string | null
  portalLocation: string | null
  locationId: string | null
  location: string | null
  capturedAt: string
}

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
  portalEquipmentId: string | null
  portalDepartmentCode: string | null
  portalDepartmentName: string | null
  portalStatus: string | null
  portalLocation: string | null
  portalUpdatedAt: string | null
  portalUrl: string | null
  lastSyncedAt: string | null
  syncState: EquipmentSyncState
  archivedAt: string | null
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

export interface EquipmentPortalPmCal {
  id: string
  equipmentId: string
  portalPlanId: string
  fiscalYear: number | null
  calendarMonth: number | null
  calType: 'PM' | 'CAL' | null
  dueDate: string | null
  provider: string | null
  plannedCost: number | null
  recordStatus: string | null
  version: number | null
  completedDate: string | null
  result: string | null
  certificateNo: string | null
  portalUpdatedAt: string | null
  updatedAt: string
}

export interface EquipmentServiceRecord {
  id: string
  equipmentId: string
  planId: string | null
  portalPlanId: string | null
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
  equipmentSnapshot: EquipmentSnapshot | null
  attachments: EquipmentAttachment[]
}

export interface EquipmentSyncRun {
  id: string
  actorName: string | null
  status: 'running' | 'succeeded' | 'failed'
  startedAt: string
  finishedAt: string | null
  sourceCount: number
  createdCount: number
  updatedCount: number
  archivedCount: number
  issueCount: number
  errorMessage: string | null
}

export interface EquipmentSyncIssue {
  id: string
  syncRunId: string | null
  equipmentId: string | null
  portalEquipmentId: string | null
  issueType: 'ambiguous_match' | 'identity_conflict' | 'unmatched_local'
  reason: string
  candidateLocalIds: string[]
  portalSnapshot: Record<string, unknown>
  issueStatus: 'open' | 'resolved' | 'ignored'
  resolutionNote: string | null
  resolvedAt: string | null
  createdAt: string
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
  portalPmCal: EquipmentPortalPmCal[]
  records: EquipmentServiceRecord[]
  links: EquipmentModuleLink[]
  technicians: EquipmentTechnician[]
  iqcInstruments: { id: string; code: string; name: string }[]
  eqaSchemes: { id: string; code: string | null; name: string }[]
  locations: StockLocation[]
  dashboard: EquipmentDashboard
  sync: {
    lastRun: EquipmentSyncRun | null
    openIssues: EquipmentSyncIssue[]
  }
}

export interface PublicEquipmentContext {
  equipment: Pick<Equipment, 'code' | 'name' | 'category' | 'manufacturer' | 'model' | 'serialNumber' | 'status'>
  plans: Pick<EquipmentPlan, 'id' | 'activityType' | 'title' | 'nextDueOn' | 'dueState'>[]
  technicians: Pick<EquipmentTechnician, 'id' | 'technicianName' | 'company' | 'phone'>[]
}
