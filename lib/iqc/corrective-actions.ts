import type { IqcCorrectiveAction } from '@/lib/iqc/types'

export function findCorrectiveActionForPoint(
  actions: IqcCorrectiveAction[],
  runId: string,
  analyteId: string,
) {
  return actions.find((action) => action.runId === runId && action.analyteId === analyteId)
    ?? actions.find((action) => action.runId === runId && action.analyteId === null)
    ?? null
}
