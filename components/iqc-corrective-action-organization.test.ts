import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')

describe('IQC corrective action organization', () => {
  it('defaults to active actions and provides status filters, search, and a bounded list', () => {
    expect(view).toContain("useState<CorrectiveActionFilter>('active')")
    expect(view).toContain('กำลังดำเนินการ')
    expect(view).toContain('ค้นหาปัญหา, analyte, ผู้รับผิดชอบ หรือผู้บันทึก')
    expect(view).toContain('setVisibleActionCount((count) => count + 20)')
  })

  it('keeps details and attachments collapsed until an action is selected', () => {
    expect(view).toContain('aria-expanded={isExpanded}')
    expect(view).toContain('toggleExpanded(ca.id)')
    expect(view).toContain('{isExpanded ? (')
  })

  it('requires confirmation before the delete request', () => {
    expect(view).toContain("window.confirm('ลบ Corrective action นี้ใช่ไหม?")
    expect(view).toContain('method: \'DELETE\'')
  })

  it('marks incomplete actions and opens an editable form before review', () => {
    expect(view).toContain('ข้อมูลไม่ครบ')
    expect(view).toContain('กรอก Root cause และ Action taken ก่อนส่งตรวจผล')
    expect(view).toContain('function startEditing(ca: IqcCorrectiveAction)')
    expect(view).toContain("method: 'PATCH'")
  })

  it('shows who recorded the effectiveness result', () => {
    expect(view).toContain('ตรวจโดย ${ca.effectivenessVerifiedByName}')
    expect(view).toContain('formatDateTime(ca.effectivenessVerifiedAt)')
  })

  it('uses confirmation-of-correction wording for the effectiveness step', () => {
    expect(view).toContain('ยืนยันผลการแก้ไข')
    expect(view).toContain('รอยืนยันผลการแก้ไข')
  })
})
