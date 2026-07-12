import { describe, expect, it } from 'vitest'
import { findCorrectiveActionForPoint, runsWithoutCorrectiveActions } from '@/lib/iqc/corrective-actions'
import type { IqcCorrectiveAction } from '@/lib/iqc/types'

const runLevelAction: IqcCorrectiveAction = {
  id: 'action-1',
  runId: 'run-1',
  runDatetime: '2026-07-13T10:00:00.000Z',
  analyteId: null,
  analyteName: null,
  problem: 'Control result out of range',
  rootCause: null,
  actionTaken: null,
  status: 'open',
  createdByName: 'Lab user',
  createdAt: '2026-07-13T10:05:00.000Z',
  closedByName: null,
  closedAt: null,
}

describe('findCorrectiveActionForPoint', () => {
  it('links a point to its existing run-level corrective action', () => {
    expect(findCorrectiveActionForPoint([runLevelAction], 'run-1', 'analyte-1')).toBe(runLevelAction)
  })
})

describe('runsWithoutCorrectiveActions', () => {
  it('omits runs that already have an open or closed corrective action', () => {
    const closedAction = { ...runLevelAction, runId: 'run-2', status: 'closed' as const }

    expect(runsWithoutCorrectiveActions(
      [{ id: 'run-1' }, { id: 'run-2' }, { id: 'run-3' }],
      [runLevelAction, closedAction],
    )).toEqual([{ id: 'run-3' }])
  })
})
