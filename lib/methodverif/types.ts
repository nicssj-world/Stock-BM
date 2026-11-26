import type { CompareScale } from '@/lib/instcomp/compare'

export type MethodVerifStatus = 'draft' | 'in-progress' | 'passed' | 'failed' | 'approved' | 'rejected'
export type MethodVerifSection = 'precision' | 'lod' | 'linearity' | 'comparison' | 'qualitative'
export const METHODVERIF_SECTIONS: MethodVerifSection[] = ['precision', 'lod', 'linearity', 'comparison', 'qualitative']

export interface PrecisionData {
  days: number
  replicates: number
  levels: { label: string; claimRepeatability: number | null; claimWithinLab: number | null; values: string[][] }[]
}

export interface LodData {
  claimedLod: number | null
  minReplicates: number
  minDetectPercent: number
  values: string[]
}

export interface LinearityData {
  limit: number
  points: { expected: number | null; values: string[] }[]
}

export interface ComparisonData {
  referenceLabel: string
  biasLimit: number
  pairLimit: number
  minPairs: number
  samples: { sampleLabel: string; referenceRaw: string; candidateRaw: string }[]
}

/** Qualitative agreement (CLSI EP12-A2): categories such as HPV16+ / Negative. */
export interface QualitativeData {
  referenceLabel: string
  minSamples: number
  minAgreementPercent: number
  minReproducibilityPercent: number
  samples: { sampleLabel: string; referenceResult: string; candidateResult: string }[]
  reproducibility: { sampleLabel: string; replicateId: string; run: string; expected: string; result: string; retest: string; note: string }[]
}

export interface MethodVerifStudy {
  id: string
  title: string
  testName: string
  analyteId: string | null
  instrumentId: string
  instrumentLabel: string
  scale: CompareScale
  unit: string | null
  requiredSections: MethodVerifSection[]
  precision: PrecisionData
  lod: LodData
  linearity: LinearityData
  comparison: ComparisonData
  qualitative: QualitativeData
  status: MethodVerifStatus
  conclusion: string | null
  startedOn: string | null
  createdByName: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MethodVerifWorkspace {
  studies: MethodVerifStudy[]
  instruments: { id: string; code: string; name: string; isActive: boolean }[]
  analytes: { id: string; code: string; scale: CompareScale; unit: string | null }[]
}

export function defaultPrecision(): PrecisionData {
  return { days: 5, replicates: 5, levels: [] }
}

export function defaultLod(): LodData {
  return { claimedLod: null, minReplicates: 20, minDetectPercent: 95, values: [] }
}

export function defaultLinearity(scale: CompareScale): LinearityData {
  return { limit: scale === 'log10' ? 0.3 : 10, points: [] }
}

export function defaultComparison(scale: CompareScale): ComparisonData {
  return scale === 'log10'
    ? { referenceLabel: '', biasLimit: 0.3, pairLimit: 0.5, minPairs: 20, samples: [] }
    : { referenceLabel: '', biasLimit: 10, pairLimit: 20, minPairs: 20, samples: [] }
}

export function defaultQualitative(): QualitativeData {
  return { referenceLabel: '', minSamples: 20, minAgreementPercent: 95, minReproducibilityPercent: 95, samples: [], reproducibility: [] }
}
