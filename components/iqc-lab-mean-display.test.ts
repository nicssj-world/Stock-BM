import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const overview = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')
const chart = readFileSync(join(process.cwd(), 'components/lj-chart.tsx'), 'utf8')

describe('IQC LAB Mean display', () => {
  it('shows assigned and LAB statistics separately in the chart overview', () => {
    expect(overview).toContain('Assigned: {fmtCompact(chart.assignedMean)}')
    expect(overview).toContain('LAB: {fmtCompact(chart.labMean)}')
    expect(overview).toContain("chart.activeLimit === 'lab' ? 'LAB Mean/SD' : 'Assigned Mean/SD'")
  })

  it('shows LAB Mean, SD, sample size and lock state on the selected chart', () => {
    expect(chart).toContain('LAB Mean / SD')
    expect(chart).toContain('chart.labMean != null ? fmt(chart.labMean)')
    expect(chart).toContain('chart.labSd != null ? fmt(chart.labSd)')
    expect(chart).toContain('chart.labLockedAt')
  })
})
