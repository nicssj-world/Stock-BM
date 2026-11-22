import type { CompareScale } from '@/lib/instcomp/compare'

export type InstCompStatus = 'draft' | 'in-progress' | 'passed' | 'failed' | 'approved' | 'rejected'

export interface InstCompSample {
  id: string
  rowNo: number
  sampleLabel: string | null
  referenceRaw: string | null
  candidateRaw: string | null
  note: string | null
}

export interface InstCompStudy {
  id: string
  title: string
  testName: string
  analyteId: string | null
  scale: CompareScale
  unit: string | null
  referenceInstrumentId: string | null
  referenceLabel: string
  candidateInstrumentId: string | null
  candidateLabel: string
  biasLimit: number
  pairLimit: number
  minPairs: number
  status: InstCompStatus
  conclusion: string | null
  performedOn: string | null
  createdByName: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  samples: InstCompSample[]
}

export interface InstCompInstrument {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface InstCompAnalyte {
  id: string
  code: string
  name: string
  scale: CompareScale
  unit: string | null
}

export interface InstCompWorkspace {
  studies: InstCompStudy[]
  instruments: InstCompInstrument[]
  analytes: InstCompAnalyte[]
}
