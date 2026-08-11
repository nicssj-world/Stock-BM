// Pure comparison helpers for lot-to-lot verification. No I/O — unit-testable.
import { mean, toStat, type AnalyteScale } from '@/lib/iqc/westgard'

export function difference(oldValue: number, newValue: number): number {
  return newValue - oldValue
}

// Signed percent difference of the new lot relative to the old lot.
// Returns NaN when the old value is 0 (percent is undefined).
export function percentDiff(oldValue: number, newValue: number): number {
  if (oldValue === 0) return Number.NaN
  return ((newValue - oldValue) / oldValue) * 100
}

// Whether a percent difference is within +/- the allowed limit.
export function withinCriteria(percent: number, limitPercent: number): boolean {
  return Number.isFinite(percent) && Math.abs(percent) <= Math.abs(limitPercent)
}

// Mean signed percent bias across measurement pairs (skips undefined percents).
export function meanPercentBias(pairs: { oldValue: number; newValue: number }[]): number {
  const diffs = pairs.map((pair) => percentDiff(pair.oldValue, pair.newValue)).filter((value) => Number.isFinite(value))
  return diffs.length ? mean(diffs) : 0
}

export interface ParallelControlInput {
  level: number
  /** Mean/SD are supplied in the IQC calculation scale. */
  controlMean: number | null
  controlSd: number | null
  /** Result values are raw user-facing values; log10 analytes are transformed here. */
  oldRun1?: number | null
  oldRun2?: number | null
  newRun1?: number | null
  newRun2?: number | null
}

export interface ParallelControlResult {
  level: number
  controlMean: number
  controlSd: number
  currentMean: number
  newMean: number
  difference: number
  percentDiff: number | null
  cvPercent: number
}

export type ParallelCalculationReason =
  | 'evaluated'
  | 'insufficient-levels'
  | 'incomplete-level'
  | 'invalid-control-stats'
  | 'invalid-log-value'
  | 'invalid-denominator'
  | 'invalid-criteria'

export interface ParallelComparisonInput {
  scale: AnalyteScale
  rows: ParallelControlInput[]
  limit?: number | null
}

export interface ParallelComparisonResult {
  scale: AnalyteScale
  limit: number
  levels: ParallelControlResult[]
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

function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

function parallelResultBase(input: ParallelComparisonInput, reason: ParallelCalculationReason, limit: number): ParallelComparisonResult {
  return {
    scale: input.scale,
    limit,
    levels: [],
    currentMean: null,
    newMean: null,
    allSampleMean: null,
    selectedLevel: null,
    selectedCvPercent: null,
    selectedCvDecimal: null,
    signedIndex: null,
    index: null,
    passed: null,
    reason,
  }
}

/**
 * Calculates the local Parallel-testing formula used by the supplied form.
 *
 * For log10 analytes, run values are entered as raw copies/IU per mL and are
 * transformed before any mean, difference, or index calculation. Control
 * Mean/SD are already expected in the IQC calculation scale, which is also
 * how IQC stores log10 statistics.
 */
export function calculateParallelComparison(input: ParallelComparisonInput): ParallelComparisonResult {
  const configuredLimit = input.limit == null ? 1 : Math.abs(input.limit)
  if (!Number.isFinite(configuredLimit)) return parallelResultBase(input, 'invalid-criteria', configuredLimit)

  const result = parallelResultBase(input, 'evaluated', configuredLimit)
  const activeRows = [...input.rows]
    .filter((row) => finiteValues([row.oldRun1, row.oldRun2, row.newRun1, row.newRun2]).length > 0)
    .sort((a, b) => a.level - b.level)
  if (activeRows.length < 2) {
    result.reason = 'insufficient-levels'
    return result
  }

  const levels: ParallelControlResult[] = []
  for (const row of activeRows) {
    const oldRaw = finiteValues([row.oldRun1, row.oldRun2])
    const newRaw = finiteValues([row.newRun1, row.newRun2])
    if (!oldRaw.length || !newRaw.length) {
      result.reason = 'incomplete-level'
      return result
    }

    const controlMean = row.controlMean
    const controlSd = row.controlSd
    if (
      controlMean == null
      || controlSd == null
      || !Number.isFinite(controlMean)
      || !Number.isFinite(controlSd)
      || controlMean === 0
      || controlSd <= 0
    ) {
      result.reason = 'invalid-control-stats'
      return result
    }

    if (input.scale === 'log10' && [...oldRaw, ...newRaw].some((value) => value <= 0)) {
      result.reason = 'invalid-log-value'
      return result
    }

    const oldValues = oldRaw.map((value) => toStat(value, input.scale))
    const newValues = newRaw.map((value) => toStat(value, input.scale))
    const currentMean = mean(oldValues)
    const newMean = mean(newValues)
    const cvPercent = (controlSd / Math.abs(controlMean)) * 100
    if (![currentMean, newMean, cvPercent].every(Number.isFinite)) {
      result.reason = 'invalid-denominator'
      return result
    }

    levels.push({
      level: row.level,
      controlMean,
      controlSd,
      currentMean,
      newMean,
      difference: newMean - currentMean,
      percentDiff: currentMean === 0 ? null : ((newMean - currentMean) / currentMean) * 100,
      cvPercent,
    })
  }

  result.levels = levels
  result.currentMean = mean(levels.map((level) => level.currentMean))
  result.newMean = mean(levels.map((level) => level.newMean))
  result.allSampleMean = (result.currentMean + result.newMean) / 2
  if (!Number.isFinite(result.allSampleMean) || result.allSampleMean === 0) {
    result.reason = 'invalid-denominator'
    return result
  }

  const selected = levels.reduce((closest, level) => {
    const closestDistance = Math.abs(closest.controlMean - result.allSampleMean!)
    const levelDistance = Math.abs(level.controlMean - result.allSampleMean!)
    return levelDistance < closestDistance ? level : closest
  }, levels[0])
  result.selectedLevel = selected.level
  result.selectedCvPercent = selected.cvPercent
  result.selectedCvDecimal = selected.cvPercent / 100
  const denominator = result.selectedCvDecimal * result.allSampleMean
  if (!Number.isFinite(denominator) || denominator === 0) {
    result.reason = 'invalid-denominator'
    return result
  }

  result.signedIndex = (result.currentMean - result.newMean) / denominator
  result.index = Math.abs(result.signedIndex)
  if (!Number.isFinite(result.index)) {
    result.reason = 'invalid-denominator'
    return result
  }
  result.passed = result.index <= result.limit
  return result
}
