import type { IqcRun, IqcWorkspace } from '@/lib/iqc/types'

export const LAST_INSTRUMENT_STORAGE_KEY = 'iqc:lastInstrument'

/**
 * Default instrument for daily entry: the one this viewer used last (if it is
 * still active), otherwise the only active instrument, otherwise none.
 */
export function pickDefaultInstrumentId(instruments: Pick<IqcWorkspace['instruments'][number], 'id' | 'isActive'>[], rememberedId: string | null | undefined) {
  const active = instruments.filter((instrument) => instrument.isActive)
  if (rememberedId && active.some((instrument) => instrument.id === rememberedId)) return rememberedId
  return active.length === 1 ? active[0].id : ''
}

export function readRememberedInstrumentId() {
  try {
    return window.localStorage.getItem(LAST_INSTRUMENT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function rememberInstrumentId(instrumentId: string) {
  try {
    if (instrumentId) window.localStorage.setItem(LAST_INSTRUMENT_STORAGE_KEY, instrumentId)
  } catch {
    // Storage can be unavailable (private window, blocked site data); the default is only a convenience.
  }
}

/**
 * The run that a save just created: a run that was not in the workspace before
 * the save, on the chosen instrument. POST /api/iqc/runs returns only the new
 * workspace, so the client finds its own run here without changing the API.
 */
export function findNewRun(previousRunIds: ReadonlySet<string>, runs: IqcRun[], instrumentId: string): IqcRun | null {
  const created = runs.filter((run) => !previousRunIds.has(run.id) && (!instrumentId || run.instrumentId === instrumentId))
  if (!created.length) return null
  return [...created].sort((a, b) => b.runDatetime.localeCompare(a.runDatetime))[0]
}

const STATUS_RANK: Record<IqcRun['results'][number]['status'], number> = { rejected: 0, investigate: 1, warning: 2, not_evaluated: 3, accepted: 4 }

export function worstRunStatus(run: IqcRun) {
  const results = run.results.filter((result) => !result.isVoided)
  return results.reduce<IqcRun['results'][number]['status']>((worst, result) => (STATUS_RANK[result.status] < STATUS_RANK[worst] ? result.status : worst), 'accepted')
}
