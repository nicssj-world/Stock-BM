import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const iqcView = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')
const equipmentView = readFileSync(join(process.cwd(), 'components/equipment-view.tsx'), 'utf8')
const equipmentService = readFileSync(join(process.cwd(), 'lib/server/equipment.ts'), 'utf8')
const iqcService = readFileSync(join(process.cwd(), 'lib/server/iqc.ts'), 'utf8')

describe('IQC equipment source', () => {
  it('removes duplicate Instrument setup from the IQC settings workflow', () => {
    expect(iqcView).not.toContain('<InstrumentForm onSubmit=')
    expect(iqcView).toContain('ไปที่ทะเบียน Equipment เพื่อเปิดใช้กับ IQC')
  })

  it('enables IQC directly from a registered equipment record', () => {
    expect(equipmentView).toContain('เปิดใช้ IQC')
    expect(equipmentView).toContain('linkModule === "iqc" ? "เปิดใช้ IQC" : "เชื่อม"')
    expect(equipmentService).toContain('input.module === "iqc" && !entityId')
    expect(equipmentService).toContain('.from("iqc_instruments")')
  })

  it('shows only linked Equipment records in IQC selectors', () => {
    expect(iqcService).toContain('const instruments = allInstruments.filter((instrument) => Boolean(instrument.equipmentId))')
    expect(iqcService).toContain('instrument.code = instrument.equipmentCode')
    expect(iqcService).toContain('instrument.name = instrument.equipmentName')
  })

  it('shows the configured tests for a selected instrument and filters its entry options', () => {
    expect(iqcView).toContain('Test ที่กำหนดสำหรับเครื่องนี้:')
    expect(iqcView).toContain('const availableAnalytes = useMemo(')
    expect(iqcView).toContain('Test: {tests.length ? tests.map((plan) => plan.analyteCode).join(\', \') : \'ยังไม่ได้กำหนด\'}')
  })

  it('can fill a named test set as one group of IQC analytes', () => {
    expect(iqcView).toContain('const testSetAnalyteIds = useMemo(')
    expect(iqcView).toContain('ทุก test / ไม่เลือกชุด')
    expect(iqcView).toContain('startLot(fillLot, selectedSet)')
  })

  it('allows a Control plan to be saved for every analyte in a selected test set', () => {
    expect(iqcView).toContain('จะกำหนด Control plan ให้ครบ {selectedAnalyteIds.length} รายการในชุด {testSet}')
    expect(iqcView).toContain('analyteIds: selectedAnalyteIds')
    expect(iqcService).toContain('analyteIds?: string[]')
    expect(iqcService).toContain(".in('analyte_id', analyteIds)")
  })

  it('keeps the workflow navigation above tab-specific summary cards', () => {
    expect(iqcView).toContain('<div className="flex w-full" role="tablist"')
    expect(iqcView.indexOf('<Tabs tabs={tabs} active={tab} onChange={setTab} />')).toBeLessThan(iqcView.indexOf("{tab !== 'enter' ? <div className=\"grid gap-3"))
  })
})
