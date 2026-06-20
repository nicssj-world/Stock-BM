// Pure comparison helpers for lot-to-lot verification. No I/O — unit-testable.
import { mean } from '@/lib/iqc/westgard'

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
