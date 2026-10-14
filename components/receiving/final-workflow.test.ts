import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const wizard = read('components/receiving/receive-wizard.tsx')
const dialog = read('components/receiving/receipt-assessment-dialog.tsx')
const fields = read('components/receiving/assessment-fields.tsx')
const container = read('components/receiving/receipt-draft.tsx')
const server = read('lib/server/receiving.ts')
const assessmentRoute = read('app/api/receiving/receipts/[id]/assessment/route.ts')

describe('final receiving workflow', () => {
  it('keeps Vendor and invoice scan before the receiving dialog and review', () => {
    const order = ['เลือก Vendor', '<InvoiceImageCrop', '<PackageScan', 'role="dialog"', '<ItemPicker', 'วันหมดอายุ', 'จำนวนที่ได้รับจริง', 'ตรวจสอบก่อนยืนยัน']
    const positions = order.map((marker) => wizard.indexOf(marker))
    positions.forEach((position, index) => expect(position, order[index]).toBeGreaterThan(-1))
    expect(positions.slice(0, 3)).toEqual([...positions.slice(0, 3)].sort((a, b) => a - b))
  })

  it('scans linear invoice barcodes, resolves existing invoices and still allows entering receipt number', () => {
    expect(wizard).toContain('label="สแกนเลข Invoice / ใบส่งของ (Barcode)"')
    expect(wizard).toContain('onScanned={resolveInvoiceBarcode}')
    expect(wizard).toContain('invoice.invoiceNo')
    expect(wizard).toContain('setInvoiceId(invoice.id)')
    expect(wizard).toContain('label="เลขที่ใบรับเข้า"')
  })

  it('does not mutate stock or send requests until the injected adapter confirms', () => {
    expect(wizard).not.toMatch(/fetch\(|api\(|\/api\/|\.rpc\(|supabase/)
    expect(wizard).toContain('adapter.submit(')
  })

  it('opens a quantity dialog after scans and preserves the draft until explicit add', () => {
    const scanFn = wizard.slice(wizard.indexOf('function applyScan'), wizard.indexOf('function addLine'))
    expect(scanFn).toContain('setLineDialogOpen(true)')
    expect(scanFn).toContain('const scannedItemId = result.itemId ?? result.parsed.itemId ?? null')
    expect(scanFn).toContain('...(scannedItemId && !editor.itemId ? { itemId: scannedItemId } : {})')
    expect(wizard).toContain('role="dialog"')
    expect(wizard).toContain('aria-modal="true"')
    expect(wizard).toContain('setLineDialogOpen(false)')
    expect(wizard).toContain('setScanResetKey((current) => current + 1)')
    expect(wizard).not.toContain("key={editor.itemId ?? 'no-item'}")
    expect(wizard).toContain('กรุณาเลือก Item / Catalog-REF จาก Item Master')
    expect(wizard).toContain('กรุณาระบุจำนวนที่ได้รับจริง (มากกว่า 0)')
  })

  it('auto-fills Lot/Expiry from the scan and keeps manual entry when the barcode lacks them', () => {
    expect(wizard).toContain('...(parsed.lot ? { lotNumber: parsed.lot } : {})')
    expect(wizard).toContain('...(parsed.expiry ? { expiryDate: parsed.expiry } : {})')
    expect(wizard).toContain("patchEditor({ lotNumber: event.target.value })")
    expect(wizard).toContain("patchEditor({ expiryDate: event.target.value })")
  })

  it('requires an actual received quantity and keeps the existing TOR/expiry-exception rules', () => {
    expect(wizard).toContain("กรุณาระบุจำนวนที่ได้รับจริง (มากกว่า 0)")
    expect(wizard).toContain('torExpiryCompliance(')
    expect(wizard).toContain('P-01/P-02')
    expect(wizard).toContain('<ExpiryException')
  })

  it('stores AI 240 / manufacture / serial as barcode evidence, not as Catalog/REF', () => {
    expect(wizard).toContain('barcodeAdditionalProductId: line.scan?.additionalProductId')
    expect(wizard).toContain('barcodeManufactureDate:')
    expect(wizard).toContain('barcodeSerial:')
  })

  it('uses the existing draft → confirm_bm_receipt path and only then opens the assessment', () => {
    expect(container).toContain("'/api/receiving/receipts'")
    expect(container).toContain('/confirm`')
    expect(server).toContain("rpc('confirm_bm_receipt'")
    expect(wizard.indexOf('await adapter.submit(')).toBeLessThan(wizard.indexOf('onReceived({ receiptId: result.receiptId'))
    expect(container).toContain('onReceived={({ assessment: context }) => setAssessment(context)}')
  })

  it('keeps a failed confirmation as a draft instead of re-submitting a duplicate', () => {
    expect(container).toContain('new ReceiveDraftSavedError(')
    expect(wizard).toContain('error instanceof ReceiveDraftSavedError')
  })
})

describe('Receipt Assessment popup', () => {
  it('asks exactly the approved questions and no quantity question', () => {
    for (const field of ['productCondition', 'documentation', 'itemCorrectness', 'coldChainApplicable', 'coldChainCondition', 'hasComplaint']) expect(fields).toContain(`L.${field}.title`)
    expect(fields).not.toMatch(/name="assessment-(qty|quantity)"|จำนวนที่ได้รับ\s*\*/)
    expect(dialog).toContain('จำนวนจากใบรับเข้า (ไม่ต้องกรอกซ้ำ)')
  })

  it('shows the temperature question only when cold chain applies', () => {
    expect(fields).toContain('answers.coldChainApplicable === true ? <div')
  })

  it('dismissing leaves the stock receipt intact and the assessment Pending', () => {
    expect(dialog).toContain('การปิดหน้าต่างนี้ไม่ยกเลิกการรับ')
    expect(dialog).toContain('ประเมินภายหลัง')
    expect(dialog).not.toMatch(/fetch\(|api\(|cancel|DELETE/)
    expect(container).toContain('onDismiss={() => setAssessment(null)}')
  })

  it('supports completing Pending assessments later', () => {
    expect(container).toContain("data.assessments.filter((item) => item.status === 'pending')")
    expect(container).toContain('assessmentContextForReceipt(receipt, data)')
  })

  it('completes through a guarded, operator-only endpoint that cannot touch stock', () => {
    expect(assessmentRoute).toContain('requireStockOperator')
    expect(assessmentRoute).toContain('export async function PUT')
    const start = server.indexOf('export async function completeReceiptAssessment')
    const complete = server.slice(start, server.indexOf('export async function', start + 10))
    // The database function only completes a Pending assessment of a confirmed receipt, and never writes stock.
    expect(complete).toContain("rpc('complete_bm_receipt_assessment'")
    expect(complete).not.toMatch(/bm_stock_transactions|bm_stock_lots|receive_bm_stock/)
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609250001_bm_vendor_evaluation_foundation.sql'), 'utf8')
    const fn = sql.slice(sql.indexOf('function public.complete_bm_receipt_assessment('), sql.indexOf('function public.revise_bm_receipt_assessment('))
    expect(fn).toContain("bm_require_role(p_actor, array['Admin','Staff'])")
    expect(fn).toContain("v_receipt.status <> 'confirmed'")
    expect(fn).toContain("v_a.status <> 'pending'")
    expect(fn).not.toMatch(/bm_stock_transactions|bm_stock_lots|receive_bm_stock/)
  })
})
