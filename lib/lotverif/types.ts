import type { AnalyteDataType, AnalyteScale } from '@/lib/iqc/types'
import type { ParallelCalculationReason } from '@/lib/lotverif/compare'

export type LotVerifSubjectKind = 'reagent-lot' | 'control-lot'
export type LotVerifMethod = 'parallel-comparison' | 'qc-acceptance' | 'patient-comparison'
export type LotVerifStatus = 'draft' | 'in-progress' | 'passed' | 'failed' | 'released' | 'rejected'

export interface LotVerifMeasurement {
  id: string
  verificationId: string
  analyteId: string | null
  analyteLabel: string | null
  sampleLabel: string | null
  oldValue: number | null
  newValue: number | null
  difference: number | null
  percentDiff: number | null
  withinCriteria: boolean | null
  oldQualitative: string | null
  newQualitative: string | null
  concordant: boolean | null
  note: string | null
}

export interface LotVerification {
  id: string
  instrumentId: string | null
  instrumentCode: string | null
  instrumentName: string | null
  subjectKind: LotVerifSubjectKind
  title: string | null
  newStockLotId: string | null
  oldStockLotId: string | null
  newControlLotId: string | null
  oldControlLotId: string | null
  newLotLabel: string | null
  oldLotLabel: string | null
  method: LotVerifMethod
  acceptanceCriteria: string | null
  parallelAnalyteId: string | null
  parallelAnalyteCode: string | null
  parallelAnalyteName: string | null
  parallelScale: AnalyteScale | null
  parallelUnit: string | null
  parallelLimit: number | null
  status: LotVerifStatus
  conclusion: string | null
  performedByName: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  releasedByName: string | null
  releasedAt: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  measurements: LotVerifMeasurement[]
  parallelRows: LotVerifParallelRow[]
  parallelSummary: LotVerifParallelSummary | null
}

// Candidate lots to pick in the wizard (reagent lots from Stock, control lots from IQC).
export interface LotOption {
  id: string
  label: string
  subLabel: string | null
  instrumentIds: string[]
  analyteIds: string[]
}

export interface LotVerifInstrument {
  id: string
  code: string
  name: string
  model: string | null
  equipmentId: string | null
}

export interface LotVerifUnlinkedEquipment {
  id: string
  code: string
  name: string
  model: string | null
}

export interface LotVerifAnalyte {
  id: string
  code: string
  name: string
  dataType: AnalyteDataType
  scale: AnalyteScale
  unit: string | null
  instrumentIds: string[]
}

export interface LotVerifControlStat {
  controlLotId: string
  analyteId: string
  instrumentId: string | null
  mean: number | null
  sd: number | null
  source: 'assigned' | 'lab' | 'baseline'
}

export interface LotVerifParallelRow {
  id: string
  verificationId: string
  level: number
  controlLotId: string | null
  controlLabel: string | null
  controlMean: number | null
  controlSd: number | null
  statsSource: 'assigned' | 'lab' | 'baseline' | 'manual'
  oldRun1: number | null
  oldRun2: number | null
  newRun1: number | null
  newRun2: number | null
  currentMean: number | null
  newMean: number | null
  difference: number | null
  percentDiff: number | null
  cvPercent: number | null
}

export interface LotVerifParallelSummary {
  scale: AnalyteScale
  unit: string | null
  limit: number
  currentMean: number | null
  newMean: number | null
  allSampleMean: number | null
  selectedLevel: number | null
  selectedCvPercent: number | null
  selectedCvDecimal: number | null
  signedIndex: number | null
  index: number | null
  passed: boolean | null
  reason: ParallelCalculationReason
}

export interface LotVerifWorkspace {
  verifications: LotVerification[]
  instruments: LotVerifInstrument[]
  unlinkedEquipment: LotVerifUnlinkedEquipment[]
  reagentLots: LotOption[]
  controlLots: LotOption[]
  analytes: LotVerifAnalyte[]
  parallelControlStats: LotVerifControlStat[]
  summary: {
    total: number
    open: number
    released: number
    failedOrRejected: number
  }
}
