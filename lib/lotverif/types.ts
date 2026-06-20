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
}

// Candidate lots to pick in the wizard (reagent lots from Stock, control lots from IQC).
export interface LotOption {
  id: string
  label: string
  subLabel: string | null
}

export interface LotVerifAnalyte {
  id: string
  code: string
  name: string
}

export interface LotVerifWorkspace {
  verifications: LotVerification[]
  reagentLots: LotOption[]
  controlLots: LotOption[]
  analytes: LotVerifAnalyte[]
  summary: {
    total: number
    open: number
    released: number
    failedOrRejected: number
  }
}
