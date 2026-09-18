import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const wizard = read('components/receiving/receive-wizard.tsx')
const dialog = read('components/receiving/receipt-assessment-dialog.tsx')
const container = read('components/receiving/receipt-draft.tsx')
const server = read('lib/server/receiving.ts')
const assessmentRoute = read('app/api/receiving/receipts/[id]/assessment/route.ts')

describe('final receiving workflow', () => {
  it('follows Vendor → invoice image → Item → scan → Lot/Expiry → Qty → review → confirm', () => {
    const order = ['เลือก Vendor', '<InvoiceImageCrop', '<ItemPicker', '<PackageScan', 'วันหมดอายุ', 'จำนวนที่ได้รับจริง', 'ตรวจสอบก่อนยืนยัน']
    const positions = order.map((marker) => wizard.lastIndexOf(marker))
    positions.forEach((position, index) => expect(position, order[index]).toBeGreaterThan(-1))
    const flow = order.slice(0, 6).map((marker) => wizard.indexOf(marker, wizard.indexOf('return <div className="space-y-4">')))
    expect([...flow].sort((a, b) => a - b)).toEqual(flow)
  })

  it('lets the operator scan the receipt number with the camera as well as type it', () => {
    expect(wizard).toContain('<ScanTextField')
    expect(wizard).toContain('label="เลขที่ใบรับเข้า"')
    expect(wizard).toContain('value={receiptNo}')
    expect(wizard).toContain('onChange={setReceiptNo}')
  })

  it('never mutates or calls the network from the wizard itself — only through the injected adapter', () => {
    expect(wizard).not.toMatch(/fetch\(|api\(|\/api\/|\.rpc\(|supabase/)
    expect(wizard).toContain('adapter.submit(')
  })

  it('selects the Item from Item Master; a barcode can only propose it', () => {
    expect(wizard).toContain('proposedItemId')
    expect(wizard).toContain('ใช้ Item นี้')
    expect(wizard).toContain("!editor.itemId && result.itemId ? result.itemId : null")
    expect(wizard).not.toMatch(/catalogNo\s*[:=]\s*[^\n]*gtin/i)
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
    for (const field of ['productCondition', 'documentation', 'itemCorrectness', 'coldChainApplicable', 'coldChainCondition', 'hasComplaint']) expect(dialog).toContain(`L.${field}.title`)
    expect(dialog).not.toMatch(/name="assessment-(qty|quantity)"|จำนวนที่ได้รับ\s*\*/)
    expect(dialog).toContain('จำนวนจากใบรับเข้า (ไม่ต้องกรอกซ้ำ)')
  })

  it('shows the temperature question only when cold chain applies', () => {
    expect(dialog).toContain('answers.coldChainApplicable === true ? <div')
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
    const complete = server.slice(server.indexOf('export async function completeReceiptAssessment'))
    expect(complete).toContain(".eq('status', 'pending')")
    expect(complete).toContain("'confirmed'")
    expect(complete).not.toMatch(/\.rpc\(|bm_stock_transactions|bm_stock_lots/)
  })
})
