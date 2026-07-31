import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const rounds = readFileSync(join(process.cwd(), 'components/eqa/rounds-tab.tsx'), 'utf8')
const attachmentsRoute = readFileSync(join(process.cwd(), 'app/api/attachments/route.ts'), 'utf8')

describe('EQA attachment workflow', () => {
  it('removes the obsolete sample-receipt attachment control', () => {
    expect(rounds).not.toContain('label="เอกสารรับตัวอย่างเดิม"')
    expect(rounds).not.toContain('kind="eqa-receipt"')
  })

  it('shows and permits a certificate only after the round is submitted', () => {
    expect(rounds).toContain("const canAttachCertificate = statusIndex >= roundStatusIndex('submitted')")
    expect(rounds).toContain('{canAttachCertificate ?')
    expect(attachmentsRoute).toContain('EQA_CERTIFICATE_READY_STATUSES')
    expect(attachmentsRoute).toContain('แนบ Certificate / รายงานผลได้หลังส่งผลแล้วเท่านั้น')
  })
})
