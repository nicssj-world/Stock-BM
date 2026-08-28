import type { AnalyteScale, QcStatus, WestgardPolicyProfile, WestgardRule } from '@/lib/iqc/westgard'

export type { AnalyteScale, QcStatus, WestgardPolicyProfile } from '@/lib/iqc/westgard'
export type IqcPolicyProfile = 'cd4-legacy' | 'vl-standard-v1'
export type AnalyteDataType = 'quantitative' | 'qualitative'
export type ActiveLimit = 'assigned' | 'lab' | 'baseline'
export type IqcBaselineState = 'draft' | 'approved' | 'superseded'
export type IqcBaselineType = 'lab_observed' | 'observed_seed'
export type IqcSetupTaskState = 'complete' | 'attention' | 'blocked'
export type ConsumableKind = 'staining-reagent' | 'trucount-tube' | 'mastermix' | 'reagent' | 'other'
export type ConsumableScope = 'all' | 'absolute-only'

export interface IqcAnalyte {
  id: string
  code: string
  name: string
  dataType: AnalyteDataType
  scale: AnalyteScale
  isAbsolute: boolean
  unit: string | null
  groupLabel: string | null
  isActive: boolean
}

export interface IqcInstrument {
  id: string
  code: string
  name: string
  model: string | null
  isActive: boolean
  equipmentId: string | null
  equipmentCode: string | null
  equipmentName: string | null
  equipmentStatus: 'active' | 'maintenance' | 'out_of_service' | 'decommissioned' | null
}

export interface IqcControlMaterial {
  id: string
  name: string
  level: string | null
  manufacturer: string | null
  stockItemId: string | null
  isActive: boolean
}

export interface IqcControlLot {
  id: string
  controlMaterialId: string
  controlMaterialName: string
  level: string | null
  lotNumber: string
  expiryDate: string | null
  stockLotId: string | null
  isActive: boolean
  lockedAt: string | null
  lockedByName: string | null
  lockOverrideReason: string | null
}

export interface IqcStockLotOption {
  id: string
  itemCode: string
  itemName: string
  lotNumber: string
  expiryDate: string | null
  equipmentIds: string[]
}

export interface IqcSpec {
  id: string
  controlLotId: string
  analyteId: string
  assignedMean: number | null
  assignedSd: number | null
  labMean: number | null
  labSd: number | null
  labN: number | null
  labLockedAt: string | null
  activeLimit: ActiveLimit
  expectedQualitative: string | null
  manufacturerLower: number | null
  manufacturerUpper: number | null
  manufacturerPrecisionSd: number | null
  manufacturerTargetMean: number | null
  manufacturerTargetSd: number | null
  manufacturerSourceRef: string | null
}

export interface IqcBaseline {
  id: string
  controlLotId: string
  analyteId: string
  instrumentId: string
  baselineType: IqcBaselineType
  state: IqcBaselineState
  mean: number | null
  sd: number | null
  n: number
  expectedQualitative: string | null
  candidateN: number
  excludedN: number
  sourceRef: string | null
  reason: string | null
  version: number
  createdBy: string | null
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
}

export interface IqcBaselineCandidate {
  id: string
  baselineId: string
  resultId: string
  included: boolean
  exclusionReason: string | null
}

export interface IqcBaselineReviewCandidate {
  resultId: string
  runId: string
  runDatetime: string
  numericValue: number | null
  statValue: number | null
  qualitativeValue: string | null
  currentStatus: QcStatus
  proposedStatus: QcStatus
  currentZ: number | null
  proposedZ: number | null
  proposedRules: WestgardRule[]
  included: boolean
  exclusionReason: string | null
  isVoided: boolean
  eligibleForBaseline?: boolean
}

export interface IqcBaselineReview {
  controlLotId: string
  analyteId: string
  instrumentId: string
  analyteCode: string
  analyteName: string
  level: string | null
  lotNumber: string
  instrumentName: string
  dataType: AnalyteDataType
  scale: AnalyteScale
  policyProfile: WestgardPolicyProfile
  manufacturerLower: number | null
  manufacturerUpper: number | null
  manufacturerPrecisionSd: number | null
  manufacturerTargetMean: number | null
  manufacturerTargetSd: number | null
  manufacturerSourceRef: string | null
  currentMean: number | null
  currentSd: number | null
  currentN: number
  proposedMean: number | null
  proposedSd: number | null
  proposedN: number
  candidateN: number
  excludedN: number
  expectedQualitative: string | null
  baselineId: string | null
  baselineState: IqcBaselineState | null
  baselineType: IqcBaselineType | null
  canApply: boolean
  blockedReason: string | null
  candidates: IqcBaselineReviewCandidate[]
  impact: Record<QcStatus, number>
}

export interface IqcBaselineReviewInput {
  controlLotId: string
  analyteId: string
  instrumentId: string
  includedResultIds?: string[]
  exclusionReasons?: Record<string, string | null | undefined>
  reason?: string | null
  sourceRef?: string | null
}

export interface IqcSetupTask {
  key: 'equipment' | 'analyte' | 'lot' | 'baseline' | 'plan' | 'advanced'
  label: string
  description: string
  state: IqcSetupTaskState
  count: number
  nextAction: string
  dependencies: { label: string; done: boolean }[]
}

export interface IqcSetupHealth {
  tasks: IqcSetupTask[]
  readyCount: number
  attentionCount: number
  blockedCount: number
}

export interface IqcConsumable {
  id: string
  kind: ConsumableKind
  lotNumber: string
  stockLotId: string | null
  appliesScope: ConsumableScope
  beadCountPerTube: number | null
}

export interface IqcRunResult {
  analyteId: string
  analyteCode: string
  analyteName: string
  controlLotId: string
  numericValue: number | null
  qualitativeValue: string | null
  z: number | null
  violatedRules: string[]
  status: QcStatus
  isVoided: boolean
  evaluationBaselineId?: string | null
}

export interface IqcRun {
  id: string
  instrumentId: string | null
  instrumentName: string | null
  runNo: number | null
  runDatetime: string
  note: string | null
  enteredByName: string | null
  consumables: IqcConsumable[]
  results: IqcRunResult[]
}

export interface IqcChartPoint {
  resultId: string
  runId: string
  runDatetime: string
  value: number
  statValue: number
  z: number | null
  status: QcStatus
  violatedRules: string[]
  isVoided: boolean
}

export interface IqcLotChangeMarker {
  runDatetime: string
  kind: ConsumableKind
  lotNumber: string
}

// CD4 legacy uses one chart per (control lot x analyte); VL adds instrument
// scope because its approved baseline is instrument-specific.
export interface IqcChart {
  key: string
  controlLotId: string
  analyteId: string
  instrumentId?: string | null
  instrumentName?: string | null
  analyteCode: string
  analyteName: string
  groupLabel: string | null
  scale: AnalyteScale
  dataType: AnalyteDataType
  unit: string | null
  level: string | null
  controlMaterialName: string
  lotNumber: string
  activeLimit: ActiveLimit
  policyProfile?: WestgardPolicyProfile
  baselineId?: string | null
  baselineState?: IqcBaselineState | null
  baselineType?: IqcBaselineType | null
  baselineVersion?: number | null
  baselineCandidateN?: number | null
  manufacturerLower?: number | null
  manufacturerUpper?: number | null
  manufacturerPrecisionSd?: number | null
  manufacturerTargetMean?: number | null
  manufacturerTargetSd?: number | null
  manufacturerSourceRef?: string | null
  mean: number | null
  sd: number | null
  cv: number | null
  n: number
  assignedMean: number | null
  assignedSd: number | null
  labMean: number | null
  labSd: number | null
  labN: number | null
  labLockedAt: string | null
  // Live lab mean/SD recomputed from the current accepted points on every load
  // once the analyte reaches LAB_LOCK_MIN_POINTS. Informational until locked:
  // the active Westgard limit still follows the locked values only.
  runningLabMean: number | null
  runningLabSd: number | null
  runningLabN: number
  lockEligible: boolean
  status: QcStatus
  points: IqcChartPoint[]
  lotChanges: IqcLotChangeMarker[]
  currentConsumables: { kind: ConsumableKind; lotNumber: string }[]
}

export interface IqcCorrectiveAction {
  id: string
  runId: string
  runDatetime: string
  analyteId: string | null
  analyteName: string | null
  problem: string
  rootCause: string | null
  actionTaken: string | null
  status: 'open' | 'awaiting-effectiveness' | 'closed'
  ownerId: string | null
  ownerName: string | null
  dueDate: string | null
  effectivenessOutcome: 'pending' | 'effective' | 'ineffective'
  effectivenessNote: string | null
  effectivenessVerifiedByName: string | null
  effectivenessVerifiedAt: string | null
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
}

export interface IqcControlPlan {
  id: string
  analyteId: string
  analyteCode: string
  analyteName: string
  instrumentId: string
  instrumentName: string
  requiredLevels: string[]
  frequency: 'daily' | 'per-run'
  westgardRules: WestgardRule[]
  policyProfile?: WestgardPolicyProfile
  isActive: boolean
}

export interface IqcAlert {
  id: string
  tone: 'warning' | 'investigate' | 'rejected'
  kind: 'lot-expiring' | 'rejected-trend' | 'investigate-trend' | 'control-due' | 'capa-overdue'
  title: string
  detail: string
}

export interface IqcAssignableUser {
  id: string
  displayName: string
}

export type TeaMode = 'absolute' | 'percent'
export type SigmaRating = 'world-class' | 'good' | 'marginal' | 'poor' | 'unknown'

export interface IqcTeaSpec {
  id: string
  analyteId: string
  analyteCode: string
  analyteName: string
  teaValue: number
  teaMode: TeaMode
  teaUnit: string | null
  sourceRef: string | null
  isActive: boolean
}

export interface IqcSixSigmaRow {
  key: string
  analyteCode: string
  analyteName: string
  groupLabel: string | null
  level: string | null
  lotNumber: string
  meanValue: number | null
  cv: number | null
  biasPct: number | null
  biasSampleCount: number
  biasPeriod: string | null
  teaValue: number
  teaMode: TeaMode
  teaPct: number | null
  sigma: number | null
  rating: SigmaRating
}

export type Distribution = 'normal' | 'normal-k2' | 'rectangular' | 'triangular' | 'u-shape'
export type UncertaintySource = 'iqc' | 'calibrator' | 'eqas' | 'other'

export interface IqcUncertaintyComponent {
  id: string
  source: UncertaintySource
  type: 'A' | 'B'
  label: string | null
  value: number | null
  distribution: Distribution
  divisor: number | null
  concentration: number | null
  su: number | null
  rsu: number | null
}

export interface IqcUncertaintyBudget {
  id: string
  analyteId: string
  analyteName: string
  groupLabel: string | null
  analyteUnit: string | null
  measurand: string
  concentration: number
  coverageK: number
  combinedUc: number | null
  expandedUx: number | null
  iqcRsd: number | null
  iqcN: number | null
  iqcLotCount: number | null
  meetsRequirement: boolean
  note: string | null
  evaluatedAt: string
  validUntil: string | null
  components: IqcUncertaintyComponent[]
  teaValue: number | null
  teaMode: TeaMode | null
}

export interface IqcWorkspace {
  analytes: IqcAnalyte[]
  instruments: IqcInstrument[]
  controlMaterials: IqcControlMaterial[]
  controlLots: IqcControlLot[]
  stockLots: IqcStockLotOption[]
  specs: IqcSpec[]
  baselines?: IqcBaseline[]
  baselineCandidates?: IqcBaselineCandidate[]
  setupHealth?: IqcSetupHealth
  teaSpecs: IqcTeaSpec[]
  controlPlans: IqcControlPlan[]
  alerts: IqcAlert[]
  assignableUsers: IqcAssignableUser[]
  charts: IqcChart[]
  sixSigma: IqcSixSigmaRow[]
  uncertaintyBudgets: IqcUncertaintyBudget[]
  runs: IqcRun[]
  correctiveActions: IqcCorrectiveAction[]
  summary: {
    chartCount: number
    inControl: number
    warning: number
    rejected: number
    investigate?: number
    notEvaluated?: number
    openCorrectiveActions: number
  }
}

// Minimum accepted points before a lab mean/SD can be locked.
export const LAB_LOCK_MIN_POINTS = 20
