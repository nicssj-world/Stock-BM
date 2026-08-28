import type { IqcCorrectiveAction } from '@/lib/iqc/types'

export function findCorrectiveActionForPoint(
  actions: IqcCorrectiveAction[],
  runId: string,
  analyteId: string,
  resultId?: string | null,
) {
  return (resultId ? actions.find((action) => action.resultId === resultId) : null)
    ?? actions.find((action) => action.runId === runId && action.analyteId === analyteId && !action.resultId)
    ?? actions.find((action) => action.runId === runId && action.analyteId === null && !action.resultId)
    ?? null
}

export function runsWithoutCorrectiveActions<T extends { id: string }>(
  runs: T[],
  actions: Pick<IqcCorrectiveAction, 'runId'>[],
) {
  const recordedRunIds = new Set(actions.map((action) => action.runId))
  return runs.filter((run) => !recordedRunIds.has(run.id))
}
