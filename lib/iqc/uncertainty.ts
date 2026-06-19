// Measurement Uncertainty per QP-LAB-28 §5.4 + Roche QCloud. Pure + unit-tested.
// Works with relative uncertainties (RSU, a fraction). UC = sqrt(sum RSU^2);
// UX = k * UC; UR (on a result) = result * UX.

export type Distribution = 'normal' | 'normal-k2' | 'rectangular' | 'triangular' | 'u-shape'

export function divisorFor(distribution: Distribution): number {
  switch (distribution) {
    case 'normal':
      return 1
    case 'normal-k2':
      return 2
    case 'rectangular':
      return Math.sqrt(3)
    case 'triangular':
      return Math.sqrt(6)
    case 'u-shape':
      return Math.sqrt(2)
  }
}

export function standardUncertainty(value: number, divisor: number): number {
  return divisor > 0 ? value / divisor : 0
}

export function relativeStandardUncertainty(su: number, concentration: number): number {
  return concentration ? su / concentration : 0
}

// Pooled IQC relative SD across lots (root mean square of per-lot RSDs), QCloud-style.
// Inputs and output are in percent.
export function pooledRsd(lotRsds: number[]): number {
  if (!lotRsds.length) return 0
  const sumSquares = lotRsds.reduce((sum, rsd) => sum + rsd * rsd, 0)
  return Math.sqrt(sumSquares / lotRsds.length)
}

// Combined relative standard uncertainty (UC) from component RSUs (fractions).
export function combinedRelative(rsus: number[]): number {
  return Math.sqrt(rsus.reduce((sum, rsu) => sum + rsu * rsu, 0))
}

export function expandedRelative(uc: number, k = 2): number {
  return k * uc
}

// Expanded uncertainty of a reported result (same units as the result).
export function expandedUncertaintyOfResult(result: number, ux: number): number {
  return result * ux
}
