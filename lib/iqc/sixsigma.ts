// Six Sigma metric for QC, per Westgard: SM = (TEa% - |bias%|) / CV%.
// All inputs are percentages. Pure + unit-tested.

export type TeaMode = 'absolute' | 'percent'

// Convert an Allowable Total Error spec to a percentage relative to the mean.
// - 'percent' specs are already a percentage.
// - 'absolute' specs (e.g. 0.5 log10) are divided by the mean to get a percentage.
export function teaPercent(teaValue: number, mode: TeaMode, meanValue: number): number | null {
  if (mode === 'percent') return teaValue
  if (!meanValue) return null
  return (teaValue / Math.abs(meanValue)) * 100
}

export function sixSigma(teaPct: number, biasPct: number, cvPct: number): number | null {
  if (cvPct <= 0) return null
  return (teaPct - Math.abs(biasPct)) / cvPct
}

export type SigmaRating = 'world-class' | 'good' | 'marginal' | 'poor' | 'unknown'

// Common interpretation bands for analytical sigma.
export function sigmaRating(sigma: number | null): SigmaRating {
  if (sigma == null) return 'unknown'
  if (sigma >= 6) return 'world-class'
  if (sigma >= 4) return 'good'
  if (sigma >= 3) return 'marginal'
  return 'poor'
}
