import { describe, expect, it } from 'vitest'
import { nextIncompleteSetupTask, summarizeSetupHealth } from '@/lib/iqc/setup-health'
import type { IqcSetupTask } from '@/lib/iqc/types'

function task(key: IqcSetupTask['key'], state: IqcSetupTask['state']): IqcSetupTask {
  return { key, state, label: key, description: '', count: 0, nextAction: '', dependencies: [] }
}

describe('summarizeSetupHealth', () => {
  it('orders tasks by dependency and keeps every task (shape unchanged)', () => {
    const health = summarizeSetupHealth([
      task('equipment', 'complete'),
      task('analyte', 'complete'),
      task('lot', 'complete'),
      task('spec', 'attention'),
      task('baseline', 'complete'),
      task('plan', 'attention'),
      task('advanced', 'attention'),
    ])
    expect(health.tasks.map((item) => item.key)).toEqual(['equipment', 'analyte', 'plan', 'lot', 'spec', 'baseline', 'advanced'])
    expect(Object.keys(health).sort()).toEqual(['attentionCount', 'blockedCount', 'readyCount', 'tasks'])
  })

  it('marks advanced optional and leaves it out of the counts', () => {
    const health = summarizeSetupHealth([task('analyte', 'complete'), task('advanced', 'attention')])
    expect(health.tasks.find((item) => item.key === 'advanced')?.optional).toBe(true)
    expect(health).toMatchObject({ readyCount: 1, attentionCount: 0, blockedCount: 0 })
  })

  it('is idempotent so server output can be summarized again on the client', () => {
    const once = summarizeSetupHealth([task('lot', 'blocked'), task('analyte', 'attention'), task('advanced', 'attention')])
    expect(summarizeSetupHealth(once.tasks)).toEqual(once)
  })
})

describe('nextIncompleteSetupTask', () => {
  const health = summarizeSetupHealth([
    task('equipment', 'complete'),
    task('analyte', 'attention'),
    task('plan', 'complete'),
    task('lot', 'complete'),
    task('spec', 'attention'),
    task('advanced', 'attention'),
  ])

  it('returns the first required incomplete task', () => {
    expect(nextIncompleteSetupTask(health)).toBe('analyte')
  })

  it('looks only after the given task and never returns optional work', () => {
    expect(nextIncompleteSetupTask(health, 'plan')).toBe('spec')
    expect(nextIncompleteSetupTask(health, 'spec')).toBeNull()
  })
})
