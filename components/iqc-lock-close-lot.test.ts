import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/iqc.ts'), 'utf8')

describe('IQC lock and close lot', () => {
  it('deactivates the control lot when its statistics are locked', () => {
    expect(service).toContain(".from('iqc_control_lots').update({ is_active: false }).eq('id', controlLotId)")
    expect(view).toContain('Lock & ปิด Lot')
  })

  it('locks every analyte as one batch before closing the lot', () => {
    expect(service).toContain(".upsert(")
    expect(service).toContain("{ onConflict: 'control_lot_id,analyte_id' }")
    expect(service).toContain('const locked = await Promise.all(')
  })
})
