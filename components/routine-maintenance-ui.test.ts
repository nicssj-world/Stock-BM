import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/equipment-view.tsx'), 'utf8')
const routine = readFileSync(join(process.cwd(), 'components/routine-maintenance.tsx'), 'utf8')
const publicForm = readFileSync(join(process.cwd(), 'components/equipment-public-form.tsx'), 'utf8')
const report = readFileSync(join(process.cwd(), 'app/(protected)/equipment/routine/report/page.tsx'), 'utf8')
const qrPage = readFileSync(join(process.cwd(), 'app/(protected)/equipment/routine/[token]/page.tsx'), 'utf8')

describe('generic routine maintenance UI', () => {
  it('mounts the routine workspace for every selected equipment item', () => {
    expect(view).toContain('<RoutineMaintenance actor={actor} equipmentId={selected.id} />')
    expect(view).not.toContain('FACSLYRIC')
  })

  it('includes the admin form builder, version editing, recurrence, review, and status controls', () => {
    for (const text of ['Form Builder', 'สร้าง Version ใหม่', 'เพิ่มรายการ', 'review', 'not-applicable', 'not-done', 'idempotencyKey']) expect(routine).toContain(text)
    expect(routine).toContain('deactivate-form')
    expect(routine).toContain('routinePeriodFor')
  })

  it('keeps the public QR service page and adds a protected routine link', () => {
    expect(publicForm).toContain('equipment/routine/${token}')
    expect(qrPage).toContain('requireFullPageActor')
    expect(qrPage).toContain('RoutineMaintenance')
  })

  it('keeps Routine and technician QR destinations separate', () => {
    expect(routine).toContain('equipment/routine/${data.equipment.qrToken}')
    expect(routine).toContain('service/equipment/${data.equipment.qrToken}')
    expect(routine).toContain('QR Routine')
    expect(routine).toContain('QR ช่าง')
  })

  it('renders a generic printable report with equipment and form filters', () => {
    expect(report).toContain('name="equipmentId"')
    expect(report).toContain('name="formId"')
    expect(report).toContain('PrintButton')
    expect(report).toContain('N/A')
    expect(report).toContain('Review / Lock')
  })
})
