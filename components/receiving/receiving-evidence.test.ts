import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('receiving evidence mounting', () => {
  it('mounts stock attachments on the receipt and each receipt line', () => {
    const draft = readFileSync(join(process.cwd(), 'components/receiving/receipt-draft.tsx'), 'utf8')
    const line = readFileSync(join(process.cwd(), 'components/receiving/receipt-line-row.tsx'), 'utf8')
    expect(draft).toContain('AttachmentList module="stock" entityType="stock-receipt"')
    expect(line).toContain('AttachmentList module="stock" entityType="stock-receipt-line"')
    expect(draft).toContain('kind="receipt-evidence"')
    expect(line).toContain('kind="receipt-line-evidence"')
  })
})
