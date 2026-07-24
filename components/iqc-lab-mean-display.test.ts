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

  it('allows the three mean/SD cards to switch the chart reference', () => {
    expect(chart).toContain("type MeanView = 'active' | 'assigned' | 'lab'")
    expect(chart).toContain("const [meanView, setMeanView] = useState<MeanView>('active')")
    expect(chart).toContain('aria-pressed={selected}')
    expect(chart).toContain('onClick={() => setMeanView(view)}')
    expect(chart).toContain('กดการ์ดเพื่อเปลี่ยนเส้นและสเกลของกราฟสำหรับเปรียบเทียบ')
  })

  it('keeps the three values explicit, including the LAB lock state', () => {
    expect(chart).toContain('Active Westgard limit')
    expect(chart).toContain('Assigned Mean / SD')
    expect(chart).toContain('LAB Mean / SD')
    expect(chart).toContain('chart.labLockedAt')
  })
})
