import type { IqcSetupHealth, IqcSetupTask } from '@/lib/iqc/types'

// Order the setup cards by what actually depends on what:
// test sets → which instrument runs them → the control lot → its targets.
export const SETUP_TASK_ORDER: IqcSetupTask['key'][] = ['equipment', 'analyte', 'plan', 'lot', 'spec', 'baseline', 'advanced']

// Optional review work (TEa / Six Sigma / Uncertainty) never counts as
// missing setup, otherwise the header could never show everything ready.
export const OPTIONAL_SETUP_TASKS = new Set<IqcSetupTask['key']>(['advanced'])

export function summarizeSetupHealth(tasks: IqcSetupTask[]): IqcSetupHealth {
  const ordered = [...tasks]
    .map((task) => (OPTIONAL_SETUP_TASKS.has(task.key) ? { ...task, optional: true } : task))
    .sort((a, b) => SETUP_TASK_ORDER.indexOf(a.key) - SETUP_TASK_ORDER.indexOf(b.key))
  const counted = ordered.filter((task) => !task.optional)
  return {
    tasks: ordered,
    readyCount: counted.filter((task) => task.state === 'complete').length,
    attentionCount: counted.filter((task) => task.state === 'attention').length,
    blockedCount: counted.filter((task) => task.state === 'blocked').length,
  }
}

/** First required task that is not complete, in dependency order. */
export function nextIncompleteSetupTask(health: IqcSetupHealth, after?: IqcSetupTask['key']) {
  const start = after ? SETUP_TASK_ORDER.indexOf(after) + 1 : 0
  return health.tasks.find((task) => !task.optional && task.state !== 'complete' && SETUP_TASK_ORDER.indexOf(task.key) >= start)?.key ?? null
}
