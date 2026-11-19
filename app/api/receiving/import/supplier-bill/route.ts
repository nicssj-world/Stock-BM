import { requireStockOperator } from '@/lib/server/auth'
import { groupSupplierBillLots, parseSupplierBillTable, type SupplierBillImport } from '@/lib/receiving/supplier-bill'
import { HttpError } from '@/lib/server/errors'
import { assertReceivingEnabled } from '@/lib/server/receiving'
import { respond } from '@/lib/server/route'
import { readSupplierBillTable } from '@/lib/server/supplier-bill-xlsx'
import { approvedSupplierCodeAliases } from '@/lib/server/supplier-codes'
import { getAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES = 2 * 1024 * 1024

/**
 * Parses a supplier Bill (.xlsx) and matches each LOT to the Item Master.
 * Read-only: it creates no receipt and writes no stock. The client turns the
 * result into a per-LOT checklist that still goes through the normal
 * draft → confirm_bm_receipt path.
 */
export async function POST(request: Request) {
  return respond(async (): Promise<SupplierBillImport> => {
    await requireStockOperator()
    await assertReceivingEnabled()
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    const vendorId = String(form?.get('vendorId') ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(vendorId)) throw new HttpError(400, 'กรุณาเลือก Vendor ก่อน Import')
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size === 0 || file.size > MAX_BYTES)
      throw new HttpError(400, 'กรุณาเลือกไฟล์ Excel (.xlsx) ขนาดไม่เกิน 2 MB')

    const parsed = parseSupplierBillTable(await readSupplierBillTable(await file.arrayBuffer()))
    if (!parsed.ok) throw new HttpError(400, parsed.message)

    const admin = getAdminClient()
    const [{ data: vendor, error: vendorError }, { data, error }, aliases] = await Promise.all([
      admin.from('bm_vendors').select('id,is_active').eq('id', vendorId).maybeSingle(),
      admin.from('bm_stock_items').select('id,item_code,catalog_no').eq('is_active', true),
      approvedSupplierCodeAliases(vendorId),
    ])
    if (vendorError) throw new HttpError(500, vendorError.message)
    if (!vendor?.is_active) throw new HttpError(404, 'ไม่พบ Vendor ที่ใช้งานอยู่')
    if (error) throw new HttpError(500, error.message)
    const items = (data ?? []).map((row) => ({ id: String(row.id), itemCode: String(row.item_code ?? ''), catalogNo: row.catalog_no == null ? null : String(row.catalog_no) }))

    const grouped = groupSupplierBillLots(parsed.bill.rows, items, aliases)
    if (!grouped.ok) throw new HttpError(400, grouped.message)
    return {
      fileName: file.name.slice(0, 200),
      invoiceNumber: parsed.bill.invoiceNumber,
      invoiceDate: parsed.bill.invoiceDate,
      poNumber: parsed.bill.poNumber,
      rowCount: parsed.bill.rows.length,
      lots: grouped.lots,
    }
  })
}
