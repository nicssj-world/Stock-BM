import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202608270002_normalize_cd4_iqc_instrument_scope.sql'), 'utf8')

describe('CD4 IQC instrument normalization migration', () => {
  it('derives one canonical instrument from active CD4 control plans', () => {
    expect(sql).toContain("analyte.code in ('%CD3', '%CD4', 'AbsCD3', 'AbsCD4')")
    expect(sql).toContain('having count(distinct plan.instrument_id) = 1')
    expect(sql).toContain('v_target_instrument_id')
  })

  it('preserves results and records old/new instrument ids in audit logs', () => {
    expect(sql).toContain("'iqc.run.instrument.normalize'")
    expect(sql).toContain("'oldInstrumentId', run.instrument_id")
    expect(sql).toContain("'newInstrumentId', v_target_instrument_id")
    expect(sql).not.toContain('delete from public.iqc_')
  })
})
