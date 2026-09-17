import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'
import type {
  Invoice,
  InvoiceLine,
  Receipt,
  ReceiptLine,
  ReceivingPolicy,
  ReceivingWorkspace,
} from '@/lib/receiving/types'
import type {
  InvoiceCreateInput,
  InvoiceUpdateInput,
  ReceiptCreateInput,
  ReceiptLineInput,
  ReceiptLineUpdateInput,
  ReceiptUpdateInput,
} from '@/lib/receiving/api-schemas'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { listVendors } from '@/lib/server/vendors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
type SupabaseError = { code?: string; message: string }

function fail(error: SupabaseError | null, message = 'Receiving database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function number(value: unknown) {
  return Number(value ?? 0)
}

function nullableNumber(value: unknown) {
  return value == null ? null : Number(value)
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

const EXPIRY_EXCEPTION_PENDING_MESSAGE = 'ยังไม่เปิดใช้งานการรับสินค้าที่ไม่ผ่านเกณฑ์ TOR — รออนุมัติผู้มีสิทธิ์ (P-01/P-02)'

function toPolicy(row: RecordRow): ReceivingPolicy {
  return {
    id: asString(row.id),
    version: number(row.version),
    isEnabled: Boolean(row.is_enabled),
    expiryExceptionEnabled: Boolean(row.expiry_exception_enabled),
    expiryExceptionMinRole: nullableString(row.expiry_exception_min_role),
    expiryExceptionRequiresSecondApproval: row.expiry_exception_requires_second_approval == null ? null : Boolean(row.expiry_exception_requires_second_approval),
    isApproved: Boolean(row.is_approved),
  }
}

async function loadPolicy() {
  const { data, error } = await getAdminClient().from('bm_receiving_policies').select('*').order('version', { ascending: false }).limit(1).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Receiving policy is not configured')
  return toPolicy(data as RecordRow)
}

export async function getReceivingNavEnabled() {
  try {
    return (await loadPolicy()).isEnabled
  } catch {
    return false
  }
}

export async function assertReceivingEnabled() {
  const policy = await loadPolicy()
  if (!policy.isEnabled) throw new HttpError(404, 'Not found')
  return policy
}

function toInvoiceLine(row: RecordRow): InvoiceLine {
  return {
    id: asString(row.id),
    invoiceId: asString(row.invoice_id),
    lineNo: number(row.line_no),
    stockItemId: nullableString(row.stock_item_id),
    catalogNoText: nullableString(row.catalog_no_text),
    descriptionText: nullableString(row.description_text),
    expectedQty: number(row.expected_qty),
    lotText: nullableString(row.lot_text),
    expiryText: nullableString(row.expiry_text),
    matchMethod: nullableString(row.match_method) as InvoiceLine['matchMethod'],
    matchConfidence: nullableNumber(row.match_confidence),
    closureState: asString(row.closure_state) as InvoiceLine['closureState'],
    shortReasonCode: nullableString(row.short_reason_code),
    shortReasonNote: nullableString(row.short_reason_note),
    sortOrder: number(row.sort_order),
    createdAt: asString(row.created_at),
  }
}

function toInvoice(row: RecordRow, lines: InvoiceLine[]): Invoice {
  return {
    id: asString(row.id),
    vendorId: asString(row.vendor_id),
    invoiceNo: nullableString(row.invoice_no),
    invoiceDate: nullableString(row.invoice_date),
    status: asString(row.status) as Invoice['status'],
    source: asString(row.source) as Invoice['source'],
    ocrJobId: nullableString(row.ocr_job_id),
    note: nullableString(row.note),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    lines,
  }
}

function toReceiptLine(row: RecordRow): ReceiptLine {
  return {
    id: asString(row.id),
    receiptId: asString(row.receipt_id),
    lineNo: number(row.line_no),
    invoiceLineId: nullableString(row.invoice_line_id),
    stockItemId: asString(row.stock_item_id),
    stockLotId: nullableString(row.stock_lot_id),
    lotNumber: nullableString(row.lot_number),
    expiryDate: nullableString(row.expiry_date),
    lotMode: asString(row.lot_mode) as ReceiptLine['lotMode'],
    locationId: asString(row.location_id),
    expectedQty: nullableNumber(row.expected_qty),
    receivedQty: number(row.received_qty),
    barcodeRaw: nullableString(row.barcode_raw),
    barcodeSymbology: nullableString(row.barcode_symbology),
    barcodeStandard: nullableString(row.barcode_standard),
    barcodeGtin: nullableString(row.barcode_gtin),
    barcodeLot: nullableString(row.barcode_lot),
    barcodeExpiry: nullableString(row.barcode_expiry),
    torThresholdMonths: number(row.tor_threshold_months),
    torExpiryCompliance: asString(row.tor_expiry_compliance) as ReceiptLine['torExpiryCompliance'],
    remainingShelfLifeDays: row.remaining_shelf_life_days == null ? null : number(row.remaining_shelf_life_days),
    receiptDecision: asString(row.receipt_decision) as ReceiptLine['receiptDecision'],
    acceptanceReasonCode: nullableString(row.acceptance_reason_code) as ReceiptLine['acceptanceReasonCode'],
    acceptanceReasonNote: nullableString(row.acceptance_reason_note),
    acceptedBy: nullableString(row.accepted_by),
    acceptedAt: nullableString(row.accepted_at),
    conflicts: Array.isArray(row.conflicts) ? row.conflicts as Record<string, unknown>[] : [],
    sortOrder: number(row.sort_order),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function toReceipt(row: RecordRow, lines: ReceiptLine[]): Receipt {
  return {
    id: asString(row.id),
    receiptNo: nullableString(row.receipt_no),
    invoiceId: nullableString(row.invoice_id),
    vendorId: asString(row.vendor_id),
    receivedAt: asString(row.received_at),
    receivedDate: asString(row.received_date),
    receivedBy: asString(row.received_by),
    packagingStatus: nullableString(row.packaging_status) as Receipt['packagingStatus'],
    packagingNote: nullableString(row.packaging_note),
    temperatureStatus: nullableString(row.temperature_status) as Receipt['temperatureStatus'],
    temperatureValueC: nullableNumber(row.temperature_value_c),
    temperatureNote: nullableString(row.temperature_note),
    coldChainApplicable: Boolean(row.cold_chain_applicable),
    status: asString(row.status) as Receipt['status'],
    stockTransactionId: nullableString(row.stock_transaction_id),
    confirmedAt: nullableString(row.confirmed_at),
    confirmedBy: nullableString(row.confirmed_by),
    source: asString(row.source) as Receipt['source'],
    note: nullableString(row.note),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    lines,
  }
}

export async function getReceivingWorkspace(_actor: BmActor): Promise<ReceivingWorkspace> {
  const policy = await assertReceivingEnabled()
  const admin = getAdminClient()
  const [vendors, { data: invoiceData, error: invoiceError }, { data: invoiceLineData, error: invoiceLineError }, { data: receiptData, error: receiptError }, { data: receiptLineData, error: receiptLineError }, { data: itemData, error: itemError }, { data: locationData, error: locationError }] = await Promise.all([
    listVendors(),
    admin.from('bm_invoices').select('*').order('created_at', { ascending: false }),
    admin.from('bm_invoice_lines').select('*').order('sort_order').order('line_no'),
    admin.from('bm_receipts').select('*').order('created_at', { ascending: false }),
    admin.from('bm_receipt_lines').select('*').order('sort_order').order('line_no'),
    admin.from('bm_stock_items').select('id,item_code,name,unit,track_lot,track_expiry').eq('is_active', true).order('item_code'),
    admin.from('bm_stock_locations').select('id,code,name,is_active').eq('is_active', true).order('code'),
  ])
  fail(invoiceError)
  fail(invoiceLineError)
  fail(receiptError)
  fail(receiptLineError)
  fail(itemError)
  fail(locationError)

  const invoiceLinesByInvoice = new Map<string, InvoiceLine[]>()
  for (const row of (invoiceLineData ?? []) as RecordRow[]) {
    const line = toInvoiceLine(row)
    invoiceLinesByInvoice.set(line.invoiceId, [...(invoiceLinesByInvoice.get(line.invoiceId) ?? []), line])
  }
  const receiptLinesByReceipt = new Map<string, ReceiptLine[]>()
  for (const row of (receiptLineData ?? []) as RecordRow[]) {
    const line = toReceiptLine(row)
    receiptLinesByReceipt.set(line.receiptId, [...(receiptLinesByReceipt.get(line.receiptId) ?? []), line])
  }
  return {
    vendors,
    invoices: ((invoiceData ?? []) as RecordRow[]).map((row) => toInvoice(row, invoiceLinesByInvoice.get(asString(row.id)) ?? [])),
    receipts: ((receiptData ?? []) as RecordRow[]).map((row) => toReceipt(row, receiptLinesByReceipt.get(asString(row.id)) ?? [])),
    items: ((itemData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), itemCode: asString(row.item_code), name: asString(row.name), unit: asString(row.unit), trackLot: Boolean(row.track_lot), trackExpiry: Boolean(row.track_expiry) })),
    locations: ((locationData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name), isActive: Boolean(row.is_active) })),
    policy,
  }
}

function invoiceLineRow(invoiceId: string, input: NonNullable<InvoiceCreateInput['lines']>[number]) {
  return {
    invoice_id: invoiceId,
    line_no: input.lineNo,
    stock_item_id: input.stockItemId ?? null,
    catalog_no_text: clean(input.catalogNoText),
    description_text: clean(input.descriptionText),
    expected_qty: input.expectedQty,
    lot_text: clean(input.lotText),
    expiry_text: clean(input.expiryText),
    match_method: input.matchMethod ?? null,
    match_confidence: input.matchConfidence ?? null,
    closure_state: input.closureState ?? 'open',
    short_reason_code: clean(input.shortReasonCode),
    short_reason_note: clean(input.shortReasonNote),
    sort_order: input.sortOrder ?? input.lineNo,
  }
}

async function insertInvoiceLines(invoiceId: string, lines: InvoiceCreateInput['lines'] | undefined) {
  if (!lines?.length) return
  const { error } = await getAdminClient().from('bm_invoice_lines').insert(lines.map((line) => invoiceLineRow(invoiceId, line)))
  fail(error)
}

export async function createInvoice(input: InvoiceCreateInput, actor: BmActor) {
  await assertReceivingEnabled()
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_invoices').insert({
    vendor_id: input.vendorId,
    invoice_no: clean(input.invoiceNo),
    invoice_date: input.invoiceDate ?? null,
    source: input.source ?? 'manual',
    note: clean(input.note),
    created_by: actor.id,
  }).select('id').single()
  if (error?.code === '23505') throw new HttpError(409, 'เลขที่ใบส่งของนี้ซ้ำสำหรับ vendor เดียวกัน')
  fail(error)
  const id = asString((data as RecordRow).id)
  await insertInvoiceLines(id, input.lines)
  await writeAudit(actor, 'receiving.invoice.create', 'stock-invoice', id, { vendorId: input.vendorId, invoiceNo: input.invoiceNo ?? null })
  return getReceivingWorkspace(actor)
}

export async function updateInvoice(id: string, input: InvoiceUpdateInput, actor: BmActor) {
  await assertReceivingEnabled()
  if (input.status === 'closed') throw new HttpError(501, 'รอการอนุมัติ policy การปิดใบส่งของ')
  const admin = getAdminClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.vendorId !== undefined) updates.vendor_id = input.vendorId
  if (input.invoiceNo !== undefined) updates.invoice_no = clean(input.invoiceNo)
  if (input.invoiceDate !== undefined) updates.invoice_date = input.invoiceDate
  if (input.source !== undefined) updates.source = input.source
  if (input.note !== undefined) updates.note = clean(input.note)
  if (input.status !== undefined) updates.status = input.status
  const { data, error } = await admin.from('bm_invoices').update(updates).eq('id', id).select('id').maybeSingle()
  if (error?.code === '23505') throw new HttpError(409, 'เลขที่ใบส่งของนี้ซ้ำสำหรับ vendor เดียวกัน')
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบใบส่งของ')
  await writeAudit(actor, 'receiving.invoice.update', 'stock-invoice', id, input as Record<string, unknown>)
  return getReceivingWorkspace(actor)
}

function receiptLineRow(receiptId: string, input: ReceiptLineInput) {
  return {
    receipt_id: receiptId,
    line_no: input.lineNo,
    invoice_line_id: input.invoiceLineId ?? null,
    stock_item_id: input.stockItemId,
    stock_lot_id: input.stockLotId ?? null,
    lot_number: clean(input.lotNumber),
    expiry_date: input.expiryDate ?? null,
    lot_mode: input.lotMode ?? 'new',
    location_id: input.locationId,
    expected_qty: input.expectedQty ?? null,
    received_qty: input.receivedQty,
    barcode_raw: clean(input.barcodeRaw),
    barcode_symbology: clean(input.barcodeSymbology),
    barcode_standard: clean(input.barcodeStandard),
    barcode_gtin: clean(input.barcodeGtin),
    barcode_lot: clean(input.barcodeLot),
    barcode_expiry: input.barcodeExpiry ?? null,
    tor_expiry_compliance: input.torExpiryCompliance ?? 'not_applicable',
    remaining_shelf_life_days: input.remainingShelfLifeDays ?? null,
    receipt_decision: input.receiptDecision ?? 'accepted',
    acceptance_reason_code: input.acceptanceReasonCode ?? null,
    acceptance_reason_note: clean(input.acceptanceReasonNote),
    conflicts: input.conflicts ?? [],
    sort_order: input.sortOrder ?? input.lineNo,
  }
}

async function insertReceiptLines(receiptId: string, lines: ReceiptCreateInput['lines'] | undefined) {
  if (!lines?.length) return
  const { error } = await getAdminClient().from('bm_receipt_lines').insert(lines.map((line) => receiptLineRow(receiptId, line)))
  fail(error)
}

export async function createReceiptDraft(input: ReceiptCreateInput, actor: BmActor) {
  await assertReceivingEnabled()
  const { data, error } = await getAdminClient().from('bm_receipts').insert({
    receipt_no: clean(input.receiptNo),
    invoice_id: input.invoiceId ?? null,
    vendor_id: input.vendorId,
    received_at: input.receivedAt ?? new Date().toISOString(),
    received_date: input.receivedDate,
    received_by: actor.id,
    packaging_status: input.packagingStatus ?? null,
    packaging_note: clean(input.packagingNote),
    temperature_status: input.temperatureStatus ?? null,
    temperature_value_c: input.temperatureValueC ?? null,
    temperature_note: clean(input.temperatureNote),
    cold_chain_applicable: input.coldChainApplicable ?? false,
    source: input.source ?? 'manual',
    note: clean(input.note),
    created_by: actor.id,
  }).select('id').single()
  if (error?.code === '23505') throw new HttpError(409, 'เลขที่ใบรับเข้านี้ซ้ำ')
  fail(error)
  const id = asString((data as RecordRow).id)
  await insertReceiptLines(id, input.lines)
  await writeAudit(actor, 'receiving.receipt.create', 'stock-receipt', id, { vendorId: input.vendorId })
  return getReceivingWorkspace(actor)
}

async function assertDraftReceipt(id: string) {
  const { data, error } = await getAdminClient().from('bm_receipts').select('id,status').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  if (asString((data as RecordRow).status) !== 'draft') throw new HttpError(409, 'แก้ไขได้เฉพาะใบรับเข้าที่ยังเป็นร่าง')
}

export async function updateReceipt(id: string, input: ReceiptUpdateInput, actor: BmActor) {
  await assertReceivingEnabled()
  await assertDraftReceipt(id)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.receiptNo !== undefined) updates.receipt_no = clean(input.receiptNo)
  if (input.invoiceId !== undefined) updates.invoice_id = input.invoiceId
  if (input.vendorId !== undefined) updates.vendor_id = input.vendorId
  if (input.receivedAt !== undefined) updates.received_at = input.receivedAt
  if (input.receivedDate !== undefined) updates.received_date = input.receivedDate
  if (input.packagingStatus !== undefined) updates.packaging_status = input.packagingStatus
  if (input.packagingNote !== undefined) updates.packaging_note = clean(input.packagingNote)
  if (input.temperatureStatus !== undefined) updates.temperature_status = input.temperatureStatus
  if (input.temperatureValueC !== undefined) updates.temperature_value_c = input.temperatureValueC
  if (input.temperatureNote !== undefined) updates.temperature_note = clean(input.temperatureNote)
  if (input.coldChainApplicable !== undefined) updates.cold_chain_applicable = input.coldChainApplicable
  if (input.source !== undefined) updates.source = input.source
  if (input.note !== undefined) updates.note = clean(input.note)
  const { error } = await getAdminClient().from('bm_receipts').update(updates).eq('id', id)
  if (error?.code === '23505') throw new HttpError(409, 'เลขที่ใบรับเข้านี้ซ้ำ')
  fail(error)
  await writeAudit(actor, 'receiving.receipt.update', 'stock-receipt', id, input as Record<string, unknown>)
  return getReceivingWorkspace(actor)
}

export async function addReceiptLine(receiptId: string, input: ReceiptLineInput, actor: BmActor) {
  await assertReceivingEnabled()
  await assertDraftReceipt(receiptId)
  const { data, error } = await getAdminClient().from('bm_receipt_lines').insert(receiptLineRow(receiptId, input)).select('id').single()
  fail(error)
  await writeAudit(actor, 'receiving.receipt-line.create', 'stock-receipt-line', asString((data as RecordRow).id), { receiptId })
  return getReceivingWorkspace(actor)
}

export async function updateReceiptLine(lineId: string, input: ReceiptLineUpdateInput, actor: BmActor) {
  await assertReceivingEnabled()
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_receipt_lines').select('receipt_id').eq('id', lineId).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบรายการรับเข้า')
  const receiptId = asString((current as RecordRow).receipt_id)
  await assertDraftReceipt(receiptId)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.invoiceLineId !== undefined) updates.invoice_line_id = input.invoiceLineId
  if (input.stockItemId !== undefined) updates.stock_item_id = input.stockItemId
  if (input.stockLotId !== undefined) updates.stock_lot_id = input.stockLotId
  if (input.lotNumber !== undefined) updates.lot_number = clean(input.lotNumber)
  if (input.expiryDate !== undefined) updates.expiry_date = input.expiryDate
  if (input.lotMode !== undefined) updates.lot_mode = input.lotMode
  if (input.locationId !== undefined) updates.location_id = input.locationId
  if (input.expectedQty !== undefined) updates.expected_qty = input.expectedQty
  if (input.receivedQty !== undefined) updates.received_qty = input.receivedQty
  if (input.barcodeRaw !== undefined) updates.barcode_raw = clean(input.barcodeRaw)
  if (input.barcodeSymbology !== undefined) updates.barcode_symbology = clean(input.barcodeSymbology)
  if (input.barcodeStandard !== undefined) updates.barcode_standard = clean(input.barcodeStandard)
  if (input.barcodeGtin !== undefined) updates.barcode_gtin = clean(input.barcodeGtin)
  if (input.barcodeLot !== undefined) updates.barcode_lot = clean(input.barcodeLot)
  if (input.barcodeExpiry !== undefined) updates.barcode_expiry = input.barcodeExpiry
  if (input.torExpiryCompliance !== undefined) updates.tor_expiry_compliance = input.torExpiryCompliance
  if (input.remainingShelfLifeDays !== undefined) updates.remaining_shelf_life_days = input.remainingShelfLifeDays
  if (input.receiptDecision !== undefined) updates.receipt_decision = input.receiptDecision
  if (input.acceptanceReasonCode !== undefined) updates.acceptance_reason_code = input.acceptanceReasonCode
  if (input.acceptanceReasonNote !== undefined) updates.acceptance_reason_note = clean(input.acceptanceReasonNote)
  if (input.conflicts !== undefined) updates.conflicts = input.conflicts
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
  const { error } = await admin.from('bm_receipt_lines').update(updates).eq('id', lineId)
  fail(error)
  await writeAudit(actor, 'receiving.receipt-line.update', 'stock-receipt-line', lineId, input as Record<string, unknown>)
  return getReceivingWorkspace(actor)
}

export async function deleteReceiptLine(lineId: string, actor: BmActor) {
  await assertReceivingEnabled()
  const { data, error } = await getAdminClient().from('bm_receipt_lines').select('receipt_id').eq('id', lineId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการรับเข้า')
  const receiptId = asString((data as RecordRow).receipt_id)
  await assertDraftReceipt(receiptId)
  const { error: deleteError } = await getAdminClient().from('bm_receipt_lines').delete().eq('id', lineId)
  fail(deleteError)
  await writeAudit(actor, 'receiving.receipt-line.delete', 'stock-receipt-line', lineId, { receiptId })
  return getReceivingWorkspace(actor)
}

export async function cancelReceiptDraft(id: string, actor: BmActor) {
  await assertReceivingEnabled()
  await assertDraftReceipt(id)
  const { error } = await getAdminClient().from('bm_receipts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'receiving.receipt.cancel', 'stock-receipt', id, {})
  return getReceivingWorkspace(actor)
}

export async function confirmReceipt(id: string, actor: BmActor) {
  const policy = await assertReceivingEnabled()
  const admin = getAdminClient()
  const { data: receipt, error: receiptError } = await admin.from('bm_receipts').select('id,received_date,status').eq('id', id).maybeSingle()
  fail(receiptError)
  if (!receipt) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  const { data: lines, error: lineError } = await admin.from('bm_receipt_lines').select('id,expiry_date,tor_threshold_months,tor_expiry_compliance,receipt_decision,acceptance_reason_code,acceptance_reason_note,remaining_shelf_life_days').eq('receipt_id', id).order('line_no').order('id')
  fail(lineError)
  for (const line of (lines ?? []) as RecordRow[]) {
    const expiry = nullableString(line.expiry_date)
    const received = asString((receipt as RecordRow).received_date)
    const compliance = torExpiryCompliance(expiry, received)
    if (compliance !== asString(line.tor_expiry_compliance)) {
      throw new HttpError(400, 'ข้อมูล TOR ในรายการรับเข้าไม่ตรงกับการคำนวณจากวันรับและวันหมดอายุ')
    }
    if (line.remaining_shelf_life_days != null && Number(line.remaining_shelf_life_days) !== remainingShelfLife(expiry, received)) {
      throw new HttpError(400, 'ข้อมูลอายุคงเหลือของรายการรับเข้าไม่ตรงกับวันรับและวันหมดอายุ')
    }
    if (compliance === 'not_compliant' && !policy.expiryExceptionEnabled) {
      throw new HttpError(409, EXPIRY_EXCEPTION_PENDING_MESSAGE)
    }
    if (compliance === 'not_compliant' && asString(line.receipt_decision) !== 'accepted_with_justification') {
      throw new HttpError(400, 'กรุณาระบุเหตุผลการยอมรับสินค้าที่ไม่ผ่านเกณฑ์ TOR')
    }
    if (compliance === 'not_compliant' && (!line.acceptance_reason_code || (line.acceptance_reason_code === 'other' && !String(line.acceptance_reason_note ?? '').trim()))) {
      throw new HttpError(400, 'กรุณาระบุเหตุผลการยอมรับให้ครบถ้วน')
    }
  }
  const { data, error } = await admin.rpc('confirm_bm_receipt', { p_receipt: id, p_actor: actor.id })
  if (error) {
    if (error.message.includes('Expiry exception acceptance is not enabled')) throw new HttpError(409, EXPIRY_EXCEPTION_PENDING_MESSAGE)
    if (error.message.includes('Receiving workflow is not enabled')) throw new HttpError(404, 'Not found')
    if (error.message.includes('Existing lot expiry date does not match')) throw new HttpError(409, error.message)
    fail(error)
  }
  await writeAudit(actor, 'receiving.receipt.confirm', 'stock-receipt', id, { stockTransactionId: data, expiryExceptionEnabled: policy.expiryExceptionEnabled })
  return getReceivingWorkspace(actor)
}
