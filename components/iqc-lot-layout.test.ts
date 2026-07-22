import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')

describe('IQC control-lot header layout', () => {
  it('keeps lot summary at the right of the lock controls', () => {
    expect(source).toContain('mt-3 flex flex-wrap items-center justify-between gap-3')
    expect(source).toContain('ml-auto shrink-0 text-right text-xs text-[#789097]')
  })

  it('shows active lots by default and provides a closed-lot history view', () => {
    expect(source).toContain("useState<LotVisibility>('active')")
    expect(source).toContain('Closed lots / History')
    expect(source).toContain("lotsById.get(chart.controlLotId)?.isActive === (lotVisibility === 'active')")
    expect(source).toContain("lotVisibility === 'active' ? 'All active charts' : 'All closed charts'")
  })

  it('shows the override reason in closed-lot history', () => {
    expect(source).toContain('lockOverrideReason')
  })
})
