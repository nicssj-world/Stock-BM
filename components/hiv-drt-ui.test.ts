import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/hiv-drt-view.tsx'), 'utf8')
const shell = readFileSync(join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const dashboard = readFileSync(join(process.cwd(), 'components/dashboard-view.tsx'), 'utf8')

describe('HIV DRT interface', () => {
  it('provides the four planned work areas and a 96-position rack', () => {
    expect(source).toContain("key: 'overview'")
    expect(source).toContain("key: 'storage'")
    expect(source).toContain("key: 'tracking'")
    expect(source).toContain("key: 'history'")
    expect(source).toContain('Array.from({ length: 8 }')
    expect(source).toContain('Array.from({ length: 12 }')
  })

  it('keeps auto-fill moving forward while allowing manual empty-slot selection', () => {
    expect(source).toContain('Auto-fill ช่องถัดไป')
    expect(source).toContain('ไม่ย้อนอุดช่องว่าง')
    expect(source).toContain("occupied ? ' · ไม่ว่าง' : ''")
  })

  it('renders a touch-first row-by-row rack on phones', () => {
    expect(source).toContain('p-3 sm:hidden')
    expect(source).toContain('เลือกแถว Rack')
    expect(source).toContain('grid grid-cols-3 gap-2')
    // Tapping a tube only selects it; moving tubes was removed (see hiv-drt-rack-position.test.ts).
    expect(source).toContain('แตะ tube เพื่อดูรายละเอียด')
    expect(source).toContain('เลือกตัวอย่างแล้ว · ดูรายละเอียดด้านล่าง')
    expect(source).toContain('hidden overflow-x-auto p-4 sm:block')
  })

  it('shows destruction urgency in the rack with an accessible colour and text cue', () => {
    expect(source).toContain('function rackSampleVisual')
    expect(source).toContain("state === 'due_now'")
    expect(source).toContain("state === 'due_soon'")
    expect(source).toContain("marker: 'DUE'")
    expect(source).toContain("marker: '30d'")
    expect(source).toContain('ครบกำหนดทำลาย')
    expect(source).toContain('ใกล้ครบ ≤30 วัน')
  })

  it('lets users record destruction directly from the overview for due tubes', () => {
    const overview = source.slice(source.indexOf('function Overview'), source.indexOf('function Metric'))
    expect(overview).toContain('title="Tube')
    expect(overview).toContain('dueNow.slice(0, 8).map')
    expect(overview).toContain('onDestroy(sample)')
  })

  it('only shows the storage destruction action when the selected tube is due', () => {
    expect(source).toContain("getHivDrtDestructionState(selectedSample.destroyDueOn, selectedSample.status) === 'due_now'")
    expect(source).toContain('canDestroySelectedSample ? <Button')
  })

  it('supports direct checkout, receiving results, deletion and tube destruction', () => {
    expect(source).toContain("'/api/hiv-drt/checkout'")
    expect(source).toContain('ได้รับผลแล้ว')
    expect(source).toContain('ลบ tube')
    expect(source).toContain('บันทึกทำลาย')
    expect(source).toContain('deleteSampleRecord(sample, mutate)')
    expect(source).toContain('ลบได้โดยตรงจากรายการนี้')
    expect(source).not.toContain('Specimen type')
  })

  it('adds an Outlab LN action beside delete and shows it after Tube', () => {
    expect(source).toContain('+ LN Outlab')
    expect(source).toContain('!min-h-8 !shrink-0 !whitespace-nowrap')
    expect(source).toContain('outlabLnDraft.trim() || null')
    expect(source).toContain('<th className="px-4 py-3">LN Outlab</th>')
    expect(source).toContain('formatHivDrtOutlabLn(sample.outlabLn)')
    expect(source).toContain("method: 'PATCH'")
  })

  it('shows an editable Ward column in place of the destination lab on the tracking list', () => {
    expect(source).toContain('<th className="px-4 py-3">Ward</th><th className="px-4 py-3">Checkout</th>')
    expect(source).not.toContain('<th className="px-4 py-3">Lab ปลายทาง</th>')
    expect(source).toContain('JSON.stringify({ barcode, destination, ward })')
    expect(source).toContain('wardDraft.trim() || null')
  })

  it('adds staff navigation and actionable dashboard links', () => {
    expect(shell).toContain("href: '/hiv-drt'")
    expect(shell).toContain("title: 'Management'")
    expect(shell).toContain("label: 'HPV Genotype'")
    expect(shell).toContain("label: 'HIV DRT'")
    expect(dashboard).toContain('/hiv-drt?view=tracking&filter=overdue')
    expect(dashboard).toContain('/hiv-drt?view=storage&filter=destroy_due')
  })
})
