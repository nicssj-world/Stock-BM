import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./eqa/corrective-tab.tsx', import.meta.url), 'utf8')

describe('EQA corrective action parity with IQC', () => {
  it('closes in one step without requiring an empty-body close to blank existing fields', () => {
    expect(source).toContain("close(action.id)")
    expect(source).not.toContain("body: '{}'")
  })

  it('supports ownership, due dates, and an optional effectiveness follow-up', () => {
    expect(source).toContain('ผู้รับผิดชอบ')
    expect(source).toContain('Due date')
    expect(source).toContain('ยืนยันประสิทธิผล')
    expect(source).toContain('/verify-effectiveness')
  })

  it('supports editing, deleting, and attaching files to a corrective action', () => {
    expect(source).toContain('แก้ไข corrective action แล้ว')
    expect(source).toContain('ลบ corrective action แล้ว')
    expect(source).toContain("entityType=\"eqa-corrective-action\"")
  })

  it('lets a corrective action reference a specific result', () => {
    expect(source).toContain('ผลตัวอย่างที่เกี่ยวข้อง')
  })
})
