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
  ownerId: null,
  ownerName: null,
  dueDate: null,
  effectivenessOutcome: 'pending',
  effectivenessNote: null,
  effectivenessVerifiedByName: null,
  effectivenessVerifiedAt: null,
  createdByName: 'Lab user',
  createdAt: '2026-07-13T10:05:00.000Z',
  closedByName: null,
  closedAt: null,
}

describe('findCorrectiveActionForPoint', () => {
  it('links a point to its existing run-level corrective action', () => {
    expect(findCorrectiveActionForPoint([runLevelAction], 'run-1', 'analyte-1')).toBe(runLevelAction)
  })

  it('prefers an exact result link when a run has multiple analytes or control lots', () => {
    const other = { ...runLevelAction, id: 'action-2', analyteId: 'analyte-1', resultId: 'result-other' }
    const exact = { ...runLevelAction, id: 'action-3', analyteId: 'analyte-1', resultId: 'result-exact' }

    expect(findCorrectiveActionForPoint([other, exact], 'run-1', 'analyte-1', 'result-exact')).toBe(exact)
  })

  it('falls back to legacy run plus analyte scope when resultId is unavailable', () => {
    const legacyAnalyteAction = { ...runLevelAction, id: 'action-4', analyteId: 'analyte-1' }

    expect(findCorrectiveActionForPoint([legacyAnalyteAction], 'run-1', 'analyte-1', 'old-result-id')).toBe(legacyAnalyteAction)
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
