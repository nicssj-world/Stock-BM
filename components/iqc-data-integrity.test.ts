import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const service = readFileSync(join(process.cwd(), 'lib/server/iqc.ts'), 'utf8')
const specRoute = readFileSync(join(process.cwd(), 'app/api/iqc/specs/route.ts'), 'utf8')
const view = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')

describe('IQC data integrity controls', () => {
  it('enforces active, unexpired lots at the server boundary', () => {
    expect(service).toContain('assertUsableControlLots(lotIds)')
    expect(service).toContain('assertUsableControlLots([input.controlLotId])')
  })

  it('refuses to close a lot with analytes that cannot be locked', () => {
    expect(service).toContain('assertAllLotAnalytesLockable(controlLotId)')
  })

  it('requires a reason and recalculates results when an assigned spec changes', () => {
    expect(specRoute).toContain('changeReason')
    expect(view).toContain('เหตุผลแก้ไข Spec')
    expect(service).toContain('await recalculateChartStatuses(input.controlLotId, input.analyteId)')
  })

  it('uses a UUID as the audit entity ID for control specs', () => {
    expect(service).toContain("'iqc.spec.lockLab', 'iqc-control-spec', controlLotId")
    expect(service).toContain("'iqc.spec.unlockLab', 'iqc-control-spec', controlLotId")
    expect(service).not.toContain("'iqc.spec.lockLab', 'iqc-control-spec', `${controlLotId}:${analyteId}`")
  })
})
