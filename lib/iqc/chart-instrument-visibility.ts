export type IqcChartInstrumentVisibility = 'active' | 'inactive' | 'all'

type InstrumentScopedChart = {
  instrumentId?: string | null
}

export function filterIqcChartsByInstrumentVisibility<T extends InstrumentScopedChart>(
  charts: T[],
  activeInstrumentIds: ReadonlySet<string>,
  visibility: IqcChartInstrumentVisibility,
): T[] {
  if (visibility === 'all') return charts

  return charts.filter((chart) => {
    const isActive = Boolean(chart.instrumentId && activeInstrumentIds.has(chart.instrumentId))
    return visibility === 'active' ? isActive : !isActive
  })
}
