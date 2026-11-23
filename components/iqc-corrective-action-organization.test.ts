import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The IQC CAPA tab lives in iqc-corrective-tab.tsx (StructuredCorrectiveTab).
const tab = readFileSync(join(process.cwd(), 'components/iqc-corrective-tab.tsx'), 'utf8')
const effectivenessForm = readFileSync(join(process.cwd(), 'components/corrective-effectiveness-form.tsx'), 'utf8')

describe('IQC corrective action organization', () => {
  it('defaults to active actions and provides status filters, search, and a bounded list', () => {
    expect(tab).toContain("useState<IqcCorrectiveActionFilter>('active')")
    expect(tab).toContain('กำลังดำเนินการ')
    expect(tab).toContain('ค้นหาปัญหา, analyte, ผู้รับผิดชอบ หรือผู้บันทึก')
    expect(tab).toContain('setVisibleActionCount((count) => count + 20)')
  })

  it('keeps details and attachments collapsed until an action is selected', () => {
    expect(tab).toContain('aria-expanded={isExpanded}')
    expect(tab).toContain('toggleExpanded(action.id)')
  })

  it('requires confirmation before the delete request', () => {
    expect(tab).toContain("window.confirm('ลบ Corrective action นี้ใช่ไหม?")
    expect(tab).toContain("method: 'DELETE'")
  })

  it('marks incomplete actions and opens an editable form before review', () => {
    expect(tab).toContain('ต้องเติมข้อมู')
    expect(tab).toContain('กรอกให้ครบก่อนปิด')
    expect(tab).toContain('function startEditing(action: IqcCorrectiveAction)')
    expect(tab).toContain("method: 'PATCH'")
  })

  it('shows who recorded the effectiveness result', () => {
    expect(tab).toContain('ตรวจโดย ${action.effectivenessVerifiedByName}')
    expect(tab).toContain('formatDateTime(action.effectivenessVerifiedAt)')
  })

  it('confirms effectiveness with an explicit choice and a note, not OK/Cancel dialogs', () => {
    expect(tab).toContain('รอยืนยันผลการแก้ไข')
    expect(tab).toContain('<EffectivenessForm')
    expect(tab).not.toContain('OK = effective')
    expect(effectivenessForm).toContain('ได้ผล · ปิด CAPA')
    expect(effectivenessForm).toContain('ไม่ได้ผล · เปิด CAPA ต่อ')
  })
})
