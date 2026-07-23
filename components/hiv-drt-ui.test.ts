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
    expect(source).toContain('แตะช่องปลายทางเพื่อย้ายหรือสลับ')
    expect(source).toContain('hidden overflow-x-auto p-4 sm:block')
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

  it('adds staff navigation and actionable dashboard links', () => {
    expect(shell).toContain("href: '/hiv-drt'")
    expect(shell).toContain("title: 'Management'")
    expect(shell).toContain("label: 'HPV Genotype'")
    expect(shell).toContain("label: 'HIV DRT'")
    expect(dashboard).toContain('/hiv-drt?view=tracking&filter=overdue')
    expect(dashboard).toContain('/hiv-drt?view=storage&filter=destroy_due')
  })
})
