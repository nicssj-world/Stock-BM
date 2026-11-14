import { describe, expect, it } from 'vitest'
import { filterIqcChartsByInstrumentVisibility } from './chart-instrument-visibility'

const charts = [
  { key: 'active', instrumentId: 'instrument-active' },
  { key: 'inactive', instrumentId: 'instrument-inactive' },
  { key: 'legacy', instrumentId: null },
]

const activeInstrumentIds = new Set(['instrument-active'])

describe('filterIqcChartsByInstrumentVisibility', () => {
  it('shows only charts for active linked instruments by default', () => {
    expect(filterIqcChartsByInstrumentVisibility(charts, activeInstrumentIds, 'active'))
      .toEqual([charts[0]])
  })

  it('shows inactive and legacy charts in the historical view', () => {
    expect(filterIqcChartsByInstrumentVisibility(charts, activeInstrumentIds, 'inactive'))
      .toEqual([charts[1], charts[2]])
  })

  it('includes every chart when all instruments are requested', () => {
    expect(filterIqcChartsByInstrumentVisibility(charts, activeInstrumentIds, 'all'))
      .toEqual(charts)
  })
})
