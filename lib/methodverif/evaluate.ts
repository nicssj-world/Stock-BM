import { compareInstruments, type ComparePair, type CompareSummary } from '@/lib/instcomp/compare'
import { linearityVerification, lodVerification, precisionLevel, type LinearityResult, type LodResult, type PrecisionLevelResult, type Verdict } from '@/lib/methodverif/stats'
import { qualitativeAgreement, qualitativeReproducibility, type QualitativeAgreementResult, type ReproducibilityResult } from '@/lib/methodverif/qualitative'
import { defaultQualitative, type MethodVerifSection, type MethodVerifStudy } from '@/lib/methodverif/types'

export interface SectionOutcome {
  verdict: Verdict
  reasons: string[]
}

export interface StudyEvaluation {
  precision: PrecisionLevelResult[]
  precisionOutcome: SectionOutcome
  lod: LodResult
  linearity: LinearityResult
  comparison: { pairs: ComparePair[]; summary: CompareSummary }
  comparisonOutcome: SectionOutcome
  qualitative: { agreement: QualitativeAgreementResult; reproducibility: ReproducibilityResult }
  qualitativeOutcome: SectionOutcome
  sections: Record<MethodVerifSection, SectionOutcome>
  overall: Verdict
  reasons: string[]
}

export const SECTION_LABEL: Record<MethodVerifSection, string> = {
  precision: 'Precision (EP15-A3)',
  lod: 'Limit of detection (EP17)',
  linearity: 'Linearity (EP06)',
  comparison: 'Method comparison (EP09)',
  qualitative: 'Qualitative agreement (EP12)',
}

function combine(verdicts: Verdict[]): Verdict {
  if (!verdicts.length) return 'insufficient'
  if (verdicts.includes('failed')) return 'failed'
  if (verdicts.includes('insufficient')) return 'insufficient'
  return 'passed'
}


export function evaluateStudy(study: Pick<MethodVerifStudy, 'scale' | 'requiredSections' | 'precision' | 'lod' | 'linearity' | 'comparison'> & { qualitative?: MethodVerifStudy['qualitative'] }): StudyEvaluation {
  const levels = study.precision.levels
  const precision = levels.map((level) => precisionLevel(level, study.scale, levels.length))
  const precisionOutcome: SectionOutcome = levels.length
    ? { verdict: combine(precision.map((level) => level.verdict)), reasons: precision.flatMap((level) => level.reasons.map((reason) => `${level.label}: ${reason}`)) }
    : { verdict: 'insufficient', reasons: ['ยังไม่ได้เพิ่ม level'] }
  const lod = lodVerification(study.lod)
  const linearity = linearityVerification(study.linearity.points, study.scale, study.linearity.limit)
  const comparison = compareInstruments(
    study.comparison.samples.map((sample, index) => ({ rowNo: index + 1, sampleLabel: sample.sampleLabel || null, referenceRaw: sample.referenceRaw, candidateRaw: sample.candidateRaw })),
    { scale: study.scale, biasLimit: study.comparison.biasLimit, pairLimit: study.comparison.pairLimit, minPairs: study.comparison.minPairs },
  )
  const comparisonOutcome: SectionOutcome = { verdict: comparison.summary.verdict, reasons: comparison.summary.reasons }
  const qualitativeData = study.qualitative ?? defaultQualitative()
  const agreement = qualitativeAgreement(qualitativeData.samples, qualitativeData)
  const reproducibility = qualitativeReproducibility(qualitativeData.reproducibility, qualitativeData.minReproducibilityPercent)
  // Reproducibility is optional: with no replicates entered only the agreement is judged.
  const hasReproducibility = reproducibility.n > 0
  const qualitativeOutcome: SectionOutcome = {
    verdict: combine(hasReproducibility ? [agreement.verdict, reproducibility.verdict] : [agreement.verdict]),
    reasons: [...agreement.reasons.map((reason) => `Agreement: ${reason}`), ...(hasReproducibility ? reproducibility.reasons.map((reason) => `Reproducibility: ${reason}`) : [])],
  }
  const sections: Record<MethodVerifSection, SectionOutcome> = {
    precision: precisionOutcome,
    lod: { verdict: lod.verdict, reasons: lod.reasons },
    linearity: { verdict: linearity.verdict, reasons: linearity.reasons },
    comparison: comparisonOutcome,
    qualitative: qualitativeOutcome,
  }
  const required = study.requiredSections
  return {
    precision,
    precisionOutcome,
    lod,
    linearity,
    comparison,
    comparisonOutcome,
    qualitative: { agreement, reproducibility },
    qualitativeOutcome,
    sections,
    overall: combine(required.map((section) => sections[section].verdict)),
    reasons: required.flatMap((section) => sections[section].verdict === 'passed' ? [] : sections[section].reasons.map((reason) => `${SECTION_LABEL[section]}: ${reason}`)),
  }
}
