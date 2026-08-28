import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const overview = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')
const chart = readFileSync(join(process.cwd(), 'components/lj-chart.tsx'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/iqc.ts'), 'utf8')

describe('IQC LAB Mean display', () => {
  it('shows assigned and LAB statistics separately in the chart overview', () => {
    expect(overview).toContain('Assigned: {fmtCompact(chart.assignedMean)}')
    expect(overview).toContain('LAB: {fmtCompact(chart.labMean ?? chart.runningLabMean)}')
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
    expect(chart).not.toContain('ค่าอ้างอิงจากผู้ผลิต (CoA)')
    expect(chart).not.toContain('ค่าเฉลี่ยและ SD จากห้องปฏิบัติการ (QC baseline)')
    expect(chart).toContain('chart.labLockedAt')
  })

  it('only lets locked LAB statistics drive the active Westgard limit', () => {
    expect(service).toContain('function hasLockedLabStats')
    expect(service).toContain("spec.activeLimit === 'lab' && hasLockedLabStats(spec)")
    expect(service).toContain("activeLimit: spec?.activeLimit === 'lab' && labStatisticsLocked ? 'lab' : 'assigned'")
    expect(service).toContain('labMean: labStatisticsLocked ? spec?.labMean ?? null : null')
  })

  it('recomputes a running LAB mean/SD from the same point set the lock would store', () => {
    expect(service).toContain("const labUsable = points.filter((p) => !p.isVoided && p.status !== 'rejected').map((p) => p.statValue)")
    expect(service).toContain('const lockEligible = labUsable.length >= LAB_LOCK_MIN_POINTS')
    expect(service).toContain('runningLabMean: lockEligible ? mean(labUsable) : null')
    expect(service).toContain('runningLabSd: lockEligible ? sd(labUsable) : null')
    expect(service).toContain('runningLabN: labUsable.length')
  })

  it('falls back to the running value in the LAB card while the analyte is unlocked', () => {
    expect(chart).toContain('mean: chart.labMean ?? chart.runningLabMean')
    expect(chart).toContain('sd: chart.labSd ?? chart.runningLabSd')
    expect(chart).toContain('ยังไม่ lock จึงยังไม่ใช้เป็นเกณฑ์ Westgard')
  })
})
