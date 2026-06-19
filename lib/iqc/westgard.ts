// Pure statistics + Westgard multi-rule engine for IQC. No I/O — fully unit-testable.
// All stats run on `stat_value` (already log10-transformed for log-scale analytes).

export type AnalyteScale = 'linear' | 'log10'
export type QcStatus = 'accepted' | 'warning' | 'rejected'

export interface WestgardPoint {
  z: number
  violatedRules: string[]
  status: QcStatus
}

// Rules that reject a run. 1-2s is a warning only (prompts inspection).
const REJECT_RULES = new Set(['1-3s', '2-2s', 'R-4s', '4-1s', '10x'])

export function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Sample standard deviation (n-1), the QC convention. Returns 0 for < 2 points.
export function sd(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// Coefficient of variation as a percentage.
export function cv(values: number[]): number {
  const m = mean(values)
  if (!m) return 0
  return (sd(values) / Math.abs(m)) * 100
}

export function zScore(value: number, m: number, s: number): number {
  return s > 0 ? (value - m) / s : 0
}

// Transform a raw value into the space stats are computed in (log10 for VL).
export function toStat(value: number, scale: AnalyteScale): number {
  return scale === 'log10' ? Math.log10(value) : value
}

// Evaluate Westgard multi-rules across a chronological series (oldest first).
// Each point is judged using itself and the preceding points.
export function evaluateWestgard(series: number[], m: number, s: number): WestgardPoint[] {
  const usable = s > 0
  const zs = series.map((v) => (usable ? (v - m) / s : 0))
  return series.map((_, i) => {
    const z = zs[i]
    const rules: string[] = []
    if (usable) {
      if (Math.abs(z) > 3) rules.push('1-3s')
      if (i >= 1) {
        const zp = zs[i - 1]
        if ((z > 2 && zp > 2) || (z < -2 && zp < -2)) rules.push('2-2s')
        if (Math.abs(z - zp) > 4) rules.push('R-4s')
      }
      if (i >= 3) {
        const w = zs.slice(i - 3, i + 1)
        if (w.every((x) => x > 1) || w.every((x) => x < -1)) rules.push('4-1s')
      }
      if (i >= 9) {
        const w = zs.slice(i - 9, i + 1)
        if (w.every((x) => x > 0) || w.every((x) => x < 0)) rules.push('10x')
      }
      if (Math.abs(z) > 2 && !rules.includes('1-3s')) rules.push('1-2s')
    }
    const hasReject = rules.some((rule) => REJECT_RULES.has(rule))
    const status: QcStatus = hasReject ? 'rejected' : rules.includes('1-2s') ? 'warning' : 'accepted'
    return { z, violatedRules: rules, status }
  })
}

// Convenience: evaluate only the latest point given the prior accepted series.
export function evaluateLatest(series: number[], m: number, s: number): WestgardPoint {
  const points = evaluateWestgard(series, m, s)
  return points[points.length - 1] ?? { z: 0, violatedRules: [], status: 'accepted' }
}
