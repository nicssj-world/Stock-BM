import type { AnalyteScale, QcStatus } from '@/lib/iqc/westgard'

export type { AnalyteScale, QcStatus } from '@/lib/iqc/westgard'
export type AnalyteDataType = 'quantitative' | 'qualitative'
export type ActiveLimit = 'assigned' | 'lab'
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
  z: number
  status: QcStatus
  violatedRules: string[]
  isVoided: boolean
}

export interface IqcLotChangeMarker {
  runDatetime: string
  kind: ConsumableKind
  lotNumber: string
}

// One Levey-Jennings chart per (control lot x analyte).
export interface IqcChart {
  key: string
  controlLotId: string
  analyteId: string
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
  status: 'open' | 'closed'
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
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
  biasPct: number
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
  specs: IqcSpec[]
  teaSpecs: IqcTeaSpec[]
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
    openCorrectiveActions: number
  }
}

// Minimum accepted points before a lab mean/SD can be locked.
export const LAB_LOCK_MIN_POINTS = 20
