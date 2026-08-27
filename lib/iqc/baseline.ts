import {
  evaluateLatestByPolicy,
  mean,
  sameRunR4s,
  sd,
  type QcStatus,
  type WestgardRule,
  type WestgardPolicyProfile,
} from '@/lib/iqc/westgard'

export interface BaselineValue {
  resultId: string
  runId: string
  runDatetime: string
  analyteId: string
  panel: string | null
  numericValue: number | null
  statValue: number | null
  qualitativeValue: string | null
  currentStatus: QcStatus
  currentZ: number | null
  isVoided: boolean
}

export interface BaselineSelection {
  resultId: string
  included: boolean
  exclusionReason?: string | null
}

export interface BaselineStats {
  mean: number | null
  sd: number | null
  n: number
  candidateN: number
  excludedN: number
}

export interface EvaluationBaseline {
  id: string | null
  analyteId: string
  mean: number | null
  sd: number | null
  expectedQualitative: string | null
  policyProfile: WestgardPolicyProfile
  rules: WestgardRule[]
}

export interface EvaluationAnalyte {
  id: string
  code?: string
  dataType: 'quantitative' | 'qualitative'
  panel: string | null
}

export interface EvaluationResult {
  resultId: string
  analyteId: string
  baselineId: string | null
  status: QcStatus
  z: number | null
  violatedRules: WestgardRule[]
}

export const EMPTY_STATUS_COUNTS: Record<QcStatus, number> = {
  accepted: 0,
  warning: 0,
  investigate: 0,
  rejected: 0,
  not_evaluated: 0,
}

export function calculateBaselineStats(values: number[], candidateN = values.length, excludedN = 0): BaselineStats {
  const usable = values.filter((value) => Number.isFinite(value))
  return {
    mean: usable.length ? mean(usable) : null,
    sd: usable.length >= 2 ? sd(usable) : null,
    n: usable.length,
    candidateN,
    excludedN,
  }
}

export function expectedNormalResult(values: BaselineValue[]): string {
  const observed = values
    .filter((value) => !value.isVoided && value.qualitativeValue?.trim())
    .map((value) => value.qualitativeValue!.trim())
  const counts = new Map<string, number>()
  for (const value of observed) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'Not detected'
}

function statusFromRules(rules: WestgardRule[], profile: WestgardPolicyProfile): QcStatus {
  if (rules.includes('1-3s') || rules.includes('2-2s')) return 'rejected'
  if (profile === 'vl-standard-v1' && (rules.includes('R-4s') || rules.includes('4-1s') || rules.includes('10x'))) return 'investigate'
  if (profile === 'cd4-legacy' && rules.some((rule) => ['R-4s', '4-1s', '10x'].includes(rule))) return 'rejected'
  return rules.includes('1-2s') ? 'warning' : 'accepted'
}

export function evaluateVlScope(input: {
  values: BaselineValue[]
  analytes: Map<string, EvaluationAnalyte>
  baselines: Map<string, EvaluationBaseline>
  includedResultIds?: Set<string>
}): Map<string, EvaluationResult> {
  const output = new Map<string, EvaluationResult>()
  const grouped = new Map<string, BaselineValue[]>()
  for (const value of input.values) {
    if (value.isVoided) continue
    grouped.set(value.analyteId, [...(grouped.get(value.analyteId) ?? []), value])
  }

  for (const [analyteId, values] of grouped) {
    const analyte = input.analytes.get(analyteId)
    const baseline = input.baselines.get(analyteId)
    if (!analyte || !baseline) continue
    const selectedValues = values
      .filter((value) => input.includedResultIds?.has(value.resultId) ?? true)
      .sort((a, b) => a.runDatetime.localeCompare(b.runDatetime) || a.resultId.localeCompare(b.resultId))

    if (analyte.dataType === 'qualitative') {
      for (const value of values) {
        if (!(input.includedResultIds?.has(value.resultId) ?? true)) {
          output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status: 'not_evaluated', z: null, violatedRules: [] })
          continue
        }
        const expected = baseline.expectedQualitative?.trim().toLocaleLowerCase()
        const actual = value.qualitativeValue?.trim().toLocaleLowerCase()
        const status: QcStatus = expected && actual ? (expected === actual ? 'accepted' : 'rejected') : 'not_evaluated'
        output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status, z: null, violatedRules: [] })
      }
      continue
    }

    if (baseline.mean == null || baseline.sd == null || baseline.sd <= 0) {
      for (const value of values) {
        if (input.includedResultIds?.has(value.resultId) ?? true) {
          output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status: 'not_evaluated', z: null, violatedRules: [] })
        }
      }
      continue
    }

    const planRules = baseline.rules
    const trendSeries: number[] = []
    for (const value of selectedValues) {
      if (value.statValue == null || !Number.isFinite(value.statValue)) {
        output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status: 'not_evaluated', z: null, violatedRules: [] })
        continue
      }
      const point = evaluateLatestByPolicy(trendSeries.concat(value.statValue), baseline.mean, baseline.sd, planRules, baseline.policyProfile)
      const status = statusFromRules(point.violatedRules, baseline.policyProfile)
      output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status, z: point.z, violatedRules: point.violatedRules })
      if (status !== 'rejected') trendSeries.push(value.statValue)
      else trendSeries.length = 0
    }
    for (const value of values) {
      if (!(input.includedResultIds?.has(value.resultId) ?? true)) {
        output.set(value.resultId, { resultId: value.resultId, analyteId, baselineId: baseline.id, status: 'not_evaluated', z: null, violatedRules: [] })
      }
    }
  }

  // R-4s is a same-run, between-level rule for VL. It never compares a level
  // with its own previous day and never spans a failed run.
  const sameRunGroups = new Map<string, { resultId: string; analyteId: string; z: number }[]>()
  for (const value of input.values) {
    const evaluation = output.get(value.resultId)
    const analyte = input.analytes.get(value.analyteId)
    const baseline = input.baselines.get(value.analyteId)
    if (!evaluation || !analyte || !baseline || analyte.dataType !== 'quantitative' || evaluation.z == null || baseline.policyProfile !== 'vl-standard-v1' || !baseline.rules.includes('R-4s')) continue
    const assayPanel = analyte.code?.replace(/\s*\((?:HPC|LPC|Normal)\)\s*$/i, '').replace(/\s+(?:HPC|LPC|Normal)\s*$/i, '').trim() || value.panel
    if (!assayPanel) continue
    const key = `${value.runId}:${assayPanel}`
    sameRunGroups.set(key, [...(sameRunGroups.get(key) ?? []), { resultId: value.resultId, analyteId: value.analyteId, z: evaluation.z }])
  }
  for (const points of sameRunGroups.values()) {
    const distinct = new Map<string, { resultId: string; z: number }>()
    points.forEach((point) => distinct.set(point.analyteId, { resultId: point.resultId, z: point.z }))
    if (distinct.size < 2) continue
    const flagged = sameRunR4s([...distinct.values()])
    for (const resultId of flagged) {
      const evaluation = output.get(resultId)
      if (!evaluation) continue
      const rules: WestgardRule[] = evaluation.violatedRules.includes('R-4s') ? evaluation.violatedRules : [...evaluation.violatedRules, 'R-4s']
      output.set(resultId, { ...evaluation, violatedRules: rules, status: evaluation.status === 'rejected' ? 'rejected' : 'investigate' })
    }
  }
  return output
}

export function statusCounts(evaluations: Iterable<EvaluationResult>): Record<QcStatus, number> {
  const counts = { ...EMPTY_STATUS_COUNTS }
  for (const evaluation of evaluations) counts[evaluation.status] += 1
  return counts
}
