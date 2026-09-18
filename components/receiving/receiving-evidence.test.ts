import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('receiving evidence mounting', () => {
  it('mounts stock attachments on the receipt and each receipt line', () => {
    const draft = readFileSync(join(process.cwd(), 'components/receiving/receipt-draft.tsx'), 'utf8')
    const line = readFileSync(join(process.cwd(), 'components/receiving/receipt-line-row.tsx'), 'utf8')
    expect(draft).toContain('AttachmentList module="stock" entityType="stock-receipt"')
    expect(line).toContain('AttachmentList module="stock" entityType="stock-receipt-line"')
    expect(draft).toContain("INVOICE_EVIDENCE_KIND = 'invoice-image'")
    expect(draft).toContain('kind={INVOICE_EVIDENCE_KIND}')
    expect(line).toContain('kind="receipt-line-evidence"')
  })

  it('links the confirmed invoice image to the receipt through the existing attachment route before confirmation', () => {
    const draft = readFileSync(join(process.cwd(), 'components/receiving/receipt-draft.tsx'), 'utf8')
    const draftIndex = draft.indexOf("'/api/receiving/receipts'")
    const uploadIndex = draft.indexOf("'/api/attachments'")
    const confirmIndex = draft.indexOf('/confirm`')
    expect(draftIndex).toBeGreaterThan(-1)
    expect(uploadIndex).toBeGreaterThan(draftIndex)
    expect(confirmIndex).toBeGreaterThan(uploadIndex)
    expect(draft).toContain("form.append('entityType', 'stock-receipt')")
  })
})
