import type { InstCompStatus } from '@/lib/instcomp/types'
import { linearityVerification, lodVerification, precisionLevel, type LinearityResult, type LodResult, type PrecisionLevelResult, type Verdict } from '@/lib/methodverif/stats'
import type { MethodVerifSection, MethodVerifStudy } from '@/lib/methodverif/types'

export interface SectionOutcome {
  verdict: Verdict
  reasons: string[]
}

export interface StudyEvaluation {
  precision: PrecisionLevelResult[]
  precisionOutcome: SectionOutcome
  lod: LodResult
  linearity: LinearityResult
  comparisonOutcome: SectionOutcome
  sections: Record<MethodVerifSection, SectionOutcome>
  overall: Verdict
  reasons: string[]
}

export const SECTION_LABEL: Record<MethodVerifSection, string> = {
  precision: 'Precision (EP15-A3)',
  lod: 'Limit of detection (EP17)',
  linearity: 'Linearity (EP06)',
  comparison: 'Method comparison (EP09)',
}

function combine(verdicts: Verdict[]): Verdict {
  if (!verdicts.length) return 'insufficient'
  if (verdicts.includes('failed')) return 'failed'
  if (verdicts.includes('insufficient')) return 'insufficient'
  return 'passed'
}

export function comparisonVerdict(status: InstCompStatus | null | undefined): SectionOutcome {
  if (!status) return { verdict: 'insufficient', reasons: ['ยังไม่ได้เลือกรายการ Method comparison'] }
  if (status === 'approved' || status === 'passed') return { verdict: 'passed', reasons: [] }
  if (status === 'failed' || status === 'rejected') return { verdict: 'failed', reasons: ['รายการ Method comparison ไม่ผ่านเกณฑ์'] }
  return { verdict: 'insufficient', reasons: ['รายการ Method comparison ยังไม่ได้สรุปผล'] }
}

export function evaluateStudy(study: Pick<MethodVerifStudy, 'scale' | 'requiredSections' | 'precision' | 'lod' | 'linearity' | 'comparison'>): StudyEvaluation {
  const levels = study.precision.levels
  const precision = levels.map((level) => precisionLevel(level, study.scale, levels.length))
  const precisionOutcome: SectionOutcome = levels.length
    ? { verdict: combine(precision.map((level) => level.verdict)), reasons: precision.flatMap((level) => level.reasons.map((reason) => `${level.label}: ${reason}`)) }
    : { verdict: 'insufficient', reasons: ['ยังไม่ได้เพิ่ม level'] }
  const lod = lodVerification(study.lod)
  const linearity = linearityVerification(study.linearity.points, study.scale, study.linearity.limit)
  const comparisonOutcome = comparisonVerdict(study.comparison?.status)
  const sections: Record<MethodVerifSection, SectionOutcome> = {
    precision: precisionOutcome,
    lod: { verdict: lod.verdict, reasons: lod.reasons },
    linearity: { verdict: linearity.verdict, reasons: linearity.reasons },
    comparison: comparisonOutcome,
  }
  const required = study.requiredSections
  return {
    precision,
    precisionOutcome,
    lod,
    linearity,
    comparisonOutcome,
    sections,
    overall: combine(required.map((section) => sections[section].verdict)),
    reasons: required.flatMap((section) => sections[section].verdict === 'passed' ? [] : sections[section].reasons.map((reason) => `${SECTION_LABEL[section]}: ${reason}`)),
  }
}
