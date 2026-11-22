import type { IqcChart } from '@/lib/iqc/types'

export const VL_BASELINE_MIN_POINTS = 20

type ChartLike = Pick<IqcChart, 'status' | 'policyProfile' | 'baselineState'> & { points: { isVoided: boolean }[] }

// A VL chart with no approved baseline and fewer than 20 usable points cannot be
// evaluated yet, and there is nothing to do but keep entering QC. Once it reaches
// 20 points it does need attention: someone has to review and approve the baseline.
export function isAwaitingBaselineData(chart: ChartLike) {
  if (chart.status !== 'not_evaluated') return false
  if (chart.policyProfile !== 'vl-standard-v1') return false
  if (chart.baselineState === 'approved') return false
  return chart.points.filter((point) => !point.isVoided).length < VL_BASELINE_MIN_POINTS
}

export function chartNeedsAttention(chart: ChartLike, isExpiring: boolean) {
  if (isExpiring) return true
  if (chart.status === 'accepted') return false
  return !isAwaitingBaselineData(chart)
}
