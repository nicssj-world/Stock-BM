import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/202608120002_lot_verification_instrument.sql'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/lotverif.ts'), 'utf8')
const createRoute = readFileSync(join(process.cwd(), 'app/api/lot-verification/verifications/route.ts'), 'utf8')
const view = readFileSync(join(process.cwd(), 'components/lot-verification-view.tsx'), 'utf8')

describe('Lot verification instrument scoping', () => {
  it('persists the selected IQC instrument on the verification', () => {
    expect(migration).toContain('instrument_id uuid references public.iqc_instruments(id)')
    expect(service).toContain('instrument_id: input.instrumentId')
    expect(createRoute).toContain('instrumentId: z.string().uuid()')
  })

  it('keeps the server boundary aligned with instrument-scoped analytes and lots', () => {
    expect(service).toContain('loadInstrumentScope')
    expect(service).toContain('assertInstrumentScopedLots')
    expect(service).toContain('Analyte นี้ยังไม่ได้ผูกกับเครื่องมือที่เลือก')
    expect(service).toContain('Reagent lot ที่เลือกไม่ตรงกับเครื่องมือ')
  })

  it('puts the instrument selector before the dependent pickers', () => {
    expect(view).toContain('เครื่องมือ / Instrument')
    expect(view).toContain('data.instruments.map')
    expect(view).toContain('analyte.instrumentIds.includes(form.instrumentId)')
    expect(view).toContain('lot.instrumentIds.includes(form.instrumentId)')
  })

  it('uses linked IQC instruments and surfaces equipment that still needs an IQC link', () => {
    expect(service).toContain('const instruments = instrumentRecords.filter((instrument) => Boolean(instrument.equipmentId))')
    expect(view).toContain('ยังไม่ผูก IQC')
  })
})
