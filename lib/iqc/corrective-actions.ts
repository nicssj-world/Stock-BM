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

export function runsWithoutCorrectiveActions<T extends { id: string }>(
  runs: T[],
  actions: Pick<IqcCorrectiveAction, 'runId'>[],
) {
  const recordedRunIds = new Set(actions.map((action) => action.runId))
  return runs.filter((run) => !recordedRunIds.has(run.id))
}
