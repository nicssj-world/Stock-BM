import { afterEach, describe, expect, it, vi } from 'vitest'
import { findNewRun, pickDefaultInstrumentId, readRememberedInstrumentId, rememberInstrumentId, worstRunStatus } from '@/lib/iqc/entry-defaults'
import type { IqcRun } from '@/lib/iqc/types'

const instruments = [
  { id: 'lyric', isActive: true },
  { id: 'cobas', isActive: true },
  { id: 'old', isActive: false },
]

function run(id: string, instrumentId: string, runDatetime: string, statuses: IqcRun['results'][number]['status'][] = ['accepted']): IqcRun {
  return {
    id, instrumentId, instrumentName: instrumentId, runNo: null, runDatetime, note: null, enteredByName: null, consumables: [],
    results: statuses.map((status, index) => ({ resultId: `${id}-${index}`, analyteId: `a${index}`, analyteCode: `A${index}`, analyteName: `A${index}`, controlLotId: 'lot', numericValue: 1, qualitativeValue: null, z: 0, violatedRules: [], status, isVoided: false })),
  }
}

describe('pickDefaultInstrumentId', () => {
  it('prefers the remembered instrument while it is still active', () => {
    expect(pickDefaultInstrumentId(instruments, 'cobas')).toBe('cobas')
  })

  it('ignores a remembered instrument that was deactivated or removed', () => {
    expect(pickDefaultInstrumentId(instruments, 'old')).toBe('')
    expect(pickDefaultInstrumentId(instruments, 'gone')).toBe('')
  })

  it('uses the only active instrument, otherwise leaves the choice to the user', () => {
    expect(pickDefaultInstrumentId([{ id: 'lyric', isActive: true }, { id: 'old', isActive: false }], null)).toBe('lyric')
    expect(pickDefaultInstrumentId(instruments, null)).toBe('')
  })
})

describe('remembered instrument storage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } })
    expect(readRememberedInstrumentId()).toBeNull()
    expect(() => rememberInstrumentId('lyric')).not.toThrow()
  })
})

describe('findNewRun', () => {
  it('returns the run created by this save on the chosen instrument', () => {
    const previous = new Set(['r1'])
    const runs = [run('r1', 'lyric', '2026-11-14T01:00:00Z'), run('r2', 'cobas', '2026-11-14T02:00:00Z'), run('r3', 'lyric', '2026-11-14T03:00:00Z')]
    expect(findNewRun(previous, runs, 'lyric')?.id).toBe('r3')
  })

  it('returns null when the new run is not in the returned workspace', () => {
    expect(findNewRun(new Set(['r1']), [run('r1', 'lyric', '2026-11-14T01:00:00Z')], 'lyric')).toBeNull()
  })
})

describe('worstRunStatus', () => {
  it('ranks rejected above investigate, warning and accepted', () => {
    expect(worstRunStatus(run('r', 'lyric', '', ['accepted', 'warning', 'rejected']))).toBe('rejected')
    expect(worstRunStatus(run('r', 'lyric', '', ['accepted', 'investigate', 'warning']))).toBe('investigate')
    expect(worstRunStatus(run('r', 'lyric', '', ['accepted']))).toBe('accepted')
  })

  it('ignores voided results', () => {
    const value = run('r', 'lyric', '', ['accepted', 'rejected'])
    value.results[1].isVoided = true
    expect(worstRunStatus(value)).toBe('accepted')
  })
})
