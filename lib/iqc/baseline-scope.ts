import type { IqcAnalyte, IqcControlLot, IqcWorkspace } from '@/lib/iqc/types'

type BaselineScopeInput = Pick<IqcWorkspace, 'controlLots' | 'controlPlans' | 'runs' | 'charts'>

const NON_ASSAY_TOKENS = new Set(['control', 'controls', 'qc', 'iqc', 'panel', 'kit', 'level', 'hpc', 'lpc', 'normal', 'high', 'low', 'positive', 'negative', 'pos', 'neg', 'vl'])

function searchTokens(value: string | null | undefined) {
  return (value ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function analyteFamilyTokens(analyte: IqcAnalyte) {
  const codeFamily = analyte.code.replace(/\s*\((?:HPC|LPC|Normal)\)\s*$/i, '')
  return [codeFamily, ...analyte.groupLabel ? [analyte.groupLabel] : []].flatMap(searchTokens)
}

/**
 * Narrows an instrument-scoped analyte list to the assay family represented by
 * the selected control lot. Older lots may not have a direct analyte link, so
 * observed results are the safe fallback before returning the full scope.
 */
export function getIqcBaselineAnalytesForLot(data: Pick<IqcWorkspace, 'runs'>, analytes: IqcAnalyte[], instrumentId: string, lot: IqcControlLot | undefined) {
  if (!lot) return analytes
  const lotTokens = new Set(searchTokens(`${lot.controlMaterialName} ${lot.level ?? ''}`))
  const materialMatches = analytes.filter((analyte) => analyteFamilyTokens(analyte)
    .some((token) => token.length >= 2 && !NON_ASSAY_TOKENS.has(token) && lotTokens.has(token)))
  if (materialMatches.length) return materialMatches

  const observedAnalyteIds = new Set(data.runs
    .filter((run) => run.instrumentId === instrumentId)
    .flatMap((run) => run.results.filter((result) => !result.isVoided && result.controlLotId === lot.id).map((result) => result.analyteId)))
  const observedMatches = analytes.filter((analyte) => observedAnalyteIds.has(analyte.id))
  return observedMatches.length ? observedMatches : analytes
}

export function getIqcBaselineScope(data: BaselineScopeInput, vlAnalytes: IqcAnalyte[], instrumentId: string) {
  if (!instrumentId) return { controlLots: [], analytes: [] as IqcAnalyte[] }

  // VL Normal is a qualitative expected-result check. It does not produce a
  // numeric mean/SD baseline, so it must never enter this setup scope.
  const quantitativeVlAnalytes = vlAnalytes.filter((analyte) => analyte.dataType === 'quantitative')
  const activePlans = data.controlPlans.filter((plan) => plan.isActive && plan.instrumentId === instrumentId)
  const vlAnalyteIds = new Set(quantitativeVlAnalytes.map((analyte) => analyte.id))
  const plannedAnalyteIds = new Set(activePlans.map((plan) => plan.analyteId).filter((analyteId) => vlAnalyteIds.has(analyteId)))
  const observedAnalyteIds = new Set<string>()
  const observedLotIds = new Set<string>()

  for (const run of data.runs) {
    if (run.instrumentId !== instrumentId) continue
    for (const result of run.results) {
      if (result.isVoided) continue
      observedAnalyteIds.add(result.analyteId)
      observedLotIds.add(result.controlLotId)
    }
  }

  for (const chart of data.charts) {
    if (chart.instrumentId !== instrumentId || !chart.points.some((point) => !point.isVoided)) continue
    observedAnalyteIds.add(chart.analyteId)
    observedLotIds.add(chart.controlLotId)
  }

  // Active control plans are the authoritative instrument scope. Historical
  // results remain a useful fallback when an older instrument has no plan yet.
  const scopedAnalyteIds = plannedAnalyteIds.size ? plannedAnalyteIds : observedAnalyteIds
  const analytes = quantitativeVlAnalytes.filter((analyte) => scopedAnalyteIds.has(analyte.id))
  const scopedAnalyteIdsForLots = new Set(analytes.map((analyte) => analyte.id))
  const controlLots = data.controlLots.filter((lot) => {
    if (!lot.isActive || !observedLotIds.has(lot.id) || lot.level?.trim().toLowerCase() === 'normal') return false
    return data.runs.some((run) => run.instrumentId === instrumentId && run.results.some((result) => !result.isVoided && result.controlLotId === lot.id && scopedAnalyteIdsForLots.has(result.analyteId)))
      || data.charts.some((chart) => chart.instrumentId === instrumentId && chart.controlLotId === lot.id && scopedAnalyteIdsForLots.has(chart.analyteId) && chart.points.some((point) => !point.isVoided))
  })

  return { controlLots, analytes }
}
