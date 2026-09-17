import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/receiving.ts'), 'utf8')

describe('receiving server TOR boundary', () => {
  it('recomputes date-only TOR compliance and remaining shelf life before the RPC', () => {
    expect(source).toContain("import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'")
    expect(source).toContain('const compliance = torExpiryCompliance(expiry, received)')
    expect(source).toContain('remainingShelfLife(expiry, received)')
    expect(source).toContain('ข้อมูล TOR ในรายการรับเข้าไม่ตรงกับการคำนวณจากวันรับและวันหมดอายุ')
  })

  it('enforces the unresolved P-01/P-02 exception gate independently of navigation', () => {
    expect(source).toContain('const EXPIRY_EXCEPTION_PENDING_MESSAGE')
    expect(source).toContain('if (compliance === \'not_compliant\' && !policy.expiryExceptionEnabled)')
    expect(source).toContain('admin.rpc(\'confirm_bm_receipt\'')
  })

  it('keeps invoice links on the new receiving records and guards expected quantity after receiving starts', () => {
    expect(source).toContain('status: input.status ?? \'draft\'')
    expect(source).toContain('invoice_id: input.invoiceId ?? null')
    expect(source).toContain('invoice_line_id: input.invoiceLineId ?? null')
    expect(source).toContain('assertReceiptInvoiceLinks(input.invoiceId, input.vendorId, input.lines)')
    expect(source).toContain('ไม่สามารถแก้ไข expected qty หลังเริ่มรับสินค้าได้ (P-07)')
    expect(source).toContain("writeAudit(actor, 'receiving.invoice-line.update'")
  })

  it('does not introduce a due-date policy into expected receipt handling', () => {
    expect(source).not.toContain('due_date')
    expect(source).not.toContain('dueDate')
  })
})
