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
import { assessmentIssues, normalizeAssessmentAnswers, type ReceiptAssessment } from '@/lib/receiving/assessment'
import type {
  InvoiceCreateInput,
  InvoiceLineUpdateInput,
  InvoiceUpdateInput,
  ReceiptCreateInput,
  ReceiptLineInput,
  ReceiptLineUpdateInput,
  ReceiptUpdateInput,
  ReceiptAssessmentInput,
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
    barcodeAdditionalProductId: nullableString(row.barcode_additional_product_id),
    barcodeManufactureDate: nullableString(row.barcode_manufacture_date),
    barcodeBestBefore: nullableString(row.barcode_best_before),
    barcodeSerial: nullableString(row.barcode_serial),
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

function toAssessment(row: RecordRow): ReceiptAssessment {
  return {
    id: asString(row.id),
    receiptId: asString(row.receipt_id),
    vendorId: asString(row.vendor_id),
    status: asString(row.status) === 'completed' ? 'completed' : 'pending',
    productCondition: nullableString(row.product_condition) as ReceiptAssessment['productCondition'],
    documentation: nullableString(row.documentation) as ReceiptAssessment['documentation'],
    itemCorrectness: nullableString(row.item_correctness) as ReceiptAssessment['itemCorrectness'],
    coldChainApplicable: row.cold_chain_applicable == null ? null : Boolean(row.cold_chain_applicable),
    coldChainCondition: nullableString(row.cold_chain_condition) as ReceiptAssessment['coldChainCondition'],
    hasComplaint: row.has_complaint == null ? null : Boolean(row.has_complaint),
    note: nullableString(row.note),
    assessedBy: nullableString(row.assessed_by),
    assessedAt: nullableString(row.assessed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

export async function getReceivingWorkspace(_actor: BmActor): Promise<ReceivingWorkspace> {
  const policy = await assertReceivingEnabled()
  const admin = getAdminClient()
  const [vendors, { data: invoiceData, error: invoiceError }, { data: invoiceLineData, error: invoiceLineError }, { data: receiptData, error: receiptError }, { data: receiptLineData, error: receiptLineError }, { data: itemData, error: itemError }, { data: locationData, error: locationError }, { data: assessmentData, error: assessmentError }] = await Promise.all([
    listVendors(),
    admin.from('bm_invoices').select('*').order('created_at', { ascending: false }),
    admin.from('bm_invoice_lines').select('*').order('sort_order').order('line_no'),
    admin.from('bm_receipts').select('*').order('created_at', { ascending: false }),
    admin.from('bm_receipt_lines').select('*').order('sort_order').order('line_no'),
    admin.from('bm_stock_items').select('id,item_code,name,unit,track_lot,track_expiry,catalog_no,manufacturer,supplier').eq('is_active', true).order('item_code'),
    admin.from('bm_stock_locations').select('id,code,name,is_active').eq('is_active', true).order('code'),
    admin.from('bm_receipt_assessments').select('*').order('created_at', { ascending: false }),
  ])
  fail(invoiceError)
  fail(invoiceLineError)
  fail(receiptError)
  fail(receiptLineError)
  fail(itemError)
  fail(locationError)
  fail(assessmentError)

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
    items: ((itemData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), itemCode: asString(row.item_code), name: asString(row.name), unit: asString(row.unit), trackLot: Boolean(row.track_lot), trackExpiry: Boolean(row.track_expiry), catalogNo: nullableString(row.catalog_no), manufacturer: nullableString(row.manufacturer), supplier: nullableString(row.supplier) })),
    locations: ((locationData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name), isActive: Boolean(row.is_active) })),
    assessments: ((assessmentData ?? []) as RecordRow[]).map(toAssessment),
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
    status: input.status ?? 'draft',
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

export async function updateInvoiceLine(lineId: string, input: InvoiceLineUpdateInput, actor: BmActor, invoiceId?: string) {
  await assertReceivingEnabled()
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_invoice_lines').select('id,invoice_id').eq('id', lineId).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบรายการใบส่งของ')
  const currentRow = current as RecordRow
  if (invoiceId && asString(currentRow.invoice_id) !== invoiceId) throw new HttpError(404, 'ไม่พบรายการในใบส่งของนี้')
  const resolvedInvoiceId = asString(currentRow.invoice_id)
  const { data: invoice, error: invoiceError } = await admin.from('bm_invoices').select('id,status').eq('id', resolvedInvoiceId).maybeSingle()
  fail(invoiceError)
  if (!invoice) throw new HttpError(404, 'ไม่พบใบส่งของ')
  const invoiceStatus = asString((invoice as RecordRow).status)
  if (invoiceStatus === 'closed' || invoiceStatus === 'cancelled') throw new HttpError(409, 'แก้ไขรายการไม่ได้เมื่อใบส่งของปิดหรือยกเลิกแล้ว')
  if (input.expectedQty !== undefined) {
    const { count, error: receiptError } = await admin.from('bm_receipt_lines').select('id', { count: 'exact', head: true }).eq('invoice_line_id', lineId)
    fail(receiptError)
    if ((count ?? 0) > 0) throw new HttpError(409, 'ไม่สามารถแก้ไข expected qty หลังเริ่มรับสินค้าได้ (P-07)')
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.stockItemId !== undefined) updates.stock_item_id = input.stockItemId
  if (input.catalogNoText !== undefined) updates.catalog_no_text = clean(input.catalogNoText)
  if (input.descriptionText !== undefined) updates.description_text = clean(input.descriptionText)
  if (input.expectedQty !== undefined) updates.expected_qty = input.expectedQty
  if (input.lotText !== undefined) updates.lot_text = clean(input.lotText)
  if (input.expiryText !== undefined) updates.expiry_text = clean(input.expiryText)
  if (input.matchMethod !== undefined) updates.match_method = input.matchMethod
  if (input.matchConfidence !== undefined) updates.match_confidence = input.matchConfidence
  if (input.closureState !== undefined) updates.closure_state = input.closureState
  if (input.shortReasonCode !== undefined) updates.short_reason_code = clean(input.shortReasonCode)
  if (input.shortReasonNote !== undefined) updates.short_reason_note = clean(input.shortReasonNote)
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
  const { error } = await admin.from('bm_invoice_lines').update(updates).eq('id', lineId)
  fail(error)
  await writeAudit(actor, 'receiving.invoice-line.update', 'stock-invoice-line', lineId, { invoiceId: resolvedInvoiceId, input })
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
    barcode_additional_product_id: clean(input.barcodeAdditionalProductId),
    barcode_manufacture_date: input.barcodeManufactureDate ?? null,
    barcode_best_before: input.barcodeBestBefore ?? null,
    barcode_serial: clean(input.barcodeSerial),
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

async function assertReceiptInvoiceLinks(invoiceId: string | null | undefined, vendorId: string | undefined, lines: Array<{ invoiceLineId?: string | null; stockItemId?: string | null }> | undefined) {
  const linkedLineIds = [...new Set((lines ?? []).map((line) => line.invoiceLineId).filter((id): id is string => Boolean(id)))]
  if (linkedLineIds.length > 0 && !invoiceId) throw new HttpError(400, 'ต้องระบุใบส่งของเมื่อผูกรายการรับเข้ากับ invoice line')
  if (!invoiceId) return

  const admin = getAdminClient()
  const { data: invoice, error: invoiceError } = await admin.from('bm_invoices').select('id,vendor_id,status').eq('id', invoiceId).maybeSingle()
  fail(invoiceError)
  if (!invoice) throw new HttpError(404, 'ไม่พบใบส่งของ')
  const invoiceRow = invoice as RecordRow
  if (vendorId && asString(invoiceRow.vendor_id) !== vendorId) throw new HttpError(409, 'ใบส่งของและ vendor ของใบรับเข้าไม่ตรงกัน')
  if (['closed', 'cancelled'].includes(asString(invoiceRow.status))) throw new HttpError(409, 'ไม่สามารถรับเข้าสินค้าจากใบส่งของที่ปิดหรือยกเลิกแล้ว')
  if (!linkedLineIds.length) return

  const { data: invoiceLines, error: lineError } = await admin.from('bm_invoice_lines').select('id,invoice_id').in('id', linkedLineIds)
  fail(lineError)
  const validLines = (invoiceLines ?? []) as RecordRow[]
  if (validLines.length !== linkedLineIds.length || validLines.some((line) => asString(line.invoice_id) !== invoiceId)) {
    throw new HttpError(409, 'รายการรับเข้าไม่ตรงกับใบส่งของที่เลือก')
  }
  for (const line of validLines) {
    const requested = (lines ?? []).find((item) => item.invoiceLineId === asString(line.id))
    const mappedStockItemId = nullableString(line.stock_item_id)
    if (requested?.stockItemId && mappedStockItemId && requested.stockItemId !== mappedStockItemId) {
      throw new HttpError(409, 'item ของรายการรับเข้าไม่ตรงกับ item ที่จับคู่ไว้ในใบส่งของ')
    }
  }
}

export async function createReceiptDraft(input: ReceiptCreateInput, actor: BmActor) {
  await assertReceivingEnabled()
  await assertReceiptInvoiceLinks(input.invoiceId, input.vendorId, input.lines)
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
  try {
    await insertReceiptLines(id, input.lines)
  } catch (error) {
    // Keep the draft list clean when a line fails validation: the header
    // row was just created by this request and has no ledger effect.
    await getAdminClient().from('bm_receipts').delete().eq('id', id).eq('status', 'draft')
    throw error
  }
  await writeAudit(actor, 'receiving.receipt.create', 'stock-receipt', id, { vendorId: input.vendorId })
  return { receiptId: id, receiving: await getReceivingWorkspace(actor) }
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
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_receipts').select('invoice_id,vendor_id').eq('id', id).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  const currentRow = current as RecordRow
  await assertReceiptInvoiceLinks(
    input.invoiceId !== undefined ? input.invoiceId : nullableString(currentRow.invoice_id),
    input.vendorId !== undefined ? input.vendorId : asString(currentRow.vendor_id),
    [],
  )
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
  const { error } = await admin.from('bm_receipts').update(updates).eq('id', id)
  if (error?.code === '23505') throw new HttpError(409, 'เลขที่ใบรับเข้านี้ซ้ำ')
  fail(error)
  await writeAudit(actor, 'receiving.receipt.update', 'stock-receipt', id, input as Record<string, unknown>)
  return getReceivingWorkspace(actor)
}

export async function addReceiptLine(receiptId: string, input: ReceiptLineInput, actor: BmActor) {
  await assertReceivingEnabled()
  await assertDraftReceipt(receiptId)
  const admin = getAdminClient()
  const { data: receipt, error: receiptError } = await admin.from('bm_receipts').select('invoice_id,vendor_id').eq('id', receiptId).maybeSingle()
  fail(receiptError)
  if (!receipt) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  const receiptRow = receipt as RecordRow
  await assertReceiptInvoiceLinks(nullableString(receiptRow.invoice_id), asString(receiptRow.vendor_id), [input])
  const { data, error } = await admin.from('bm_receipt_lines').insert(receiptLineRow(receiptId, input)).select('id').single()
  fail(error)
  await writeAudit(actor, 'receiving.receipt-line.create', 'stock-receipt-line', asString((data as RecordRow).id), { receiptId })
  return getReceivingWorkspace(actor)
}

export async function updateReceiptLine(lineId: string, input: ReceiptLineUpdateInput, actor: BmActor) {
  await assertReceivingEnabled()
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_receipt_lines').select('receipt_id,invoice_line_id,stock_item_id').eq('id', lineId).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'ไม่พบรายการรับเข้า')
  const receiptId = asString((current as RecordRow).receipt_id)
  await assertDraftReceipt(receiptId)
  const { data: receipt, error: receiptError } = await admin.from('bm_receipts').select('invoice_id,vendor_id').eq('id', receiptId).maybeSingle()
  fail(receiptError)
  if (!receipt) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  const currentRow = current as RecordRow
  const receiptRow = receipt as RecordRow
  await assertReceiptInvoiceLinks(
    nullableString(receiptRow.invoice_id),
    asString(receiptRow.vendor_id),
    [{
      invoiceLineId: input.invoiceLineId !== undefined ? input.invoiceLineId : nullableString(currentRow.invoice_line_id),
      stockItemId: input.stockItemId !== undefined ? input.stockItemId : asString(currentRow.stock_item_id),
    }],
  )
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
  if (input.barcodeAdditionalProductId !== undefined) updates.barcode_additional_product_id = clean(input.barcodeAdditionalProductId)
  if (input.barcodeManufactureDate !== undefined) updates.barcode_manufacture_date = input.barcodeManufactureDate
  if (input.barcodeBestBefore !== undefined) updates.barcode_best_before = input.barcodeBestBefore
  if (input.barcodeSerial !== undefined) updates.barcode_serial = clean(input.barcodeSerial)
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

/**
 * Completes the Pending assessment of an already-confirmed receipt. The stock
 * transaction was committed at confirmation; nothing here can undo or change
 * it. The conditional update makes a second submission a 409 instead of a
 * silent overwrite.
 */
export async function completeReceiptAssessment(receiptId: string, input: ReceiptAssessmentInput, actor: BmActor) {
  await assertReceivingEnabled()
  const answers = normalizeAssessmentAnswers({
    productCondition: input.productCondition,
    documentation: input.documentation,
    itemCorrectness: input.itemCorrectness,
    coldChainApplicable: input.coldChainApplicable,
    coldChainCondition: input.coldChainCondition ?? null,
    hasComplaint: input.hasComplaint,
    note: input.note ?? '',
  })
  const issues = assessmentIssues(answers)
  if (issues.length) throw new HttpError(400, issues[0].message)

  const admin = getAdminClient()
  const { data: receipt, error: receiptError } = await admin.from('bm_receipts').select('id,status,vendor_id').eq('id', receiptId).maybeSingle()
  fail(receiptError)
  if (!receipt) throw new HttpError(404, 'ไม่พบใบรับเข้า')
  if (asString((receipt as RecordRow).status) !== 'confirmed') throw new HttpError(409, 'ประเมินได้เฉพาะใบรับเข้าที่ยืนยันแล้ว')

  const now = new Date().toISOString()
  const { data, error } = await admin.from('bm_receipt_assessments').update({
    status: 'completed',
    product_condition: answers.productCondition,
    documentation: answers.documentation,
    item_correctness: answers.itemCorrectness,
    cold_chain_applicable: answers.coldChainApplicable,
    cold_chain_condition: answers.coldChainCondition,
    has_complaint: answers.hasComplaint,
    note: answers.note || null,
    assessed_by: actor.id,
    assessed_at: now,
    updated_at: now,
  }).eq('receipt_id', receiptId).eq('status', 'pending').select('id,vendor_id').maybeSingle()
  fail(error)
  if (!data) throw new HttpError(409, 'การประเมินนี้บันทึกแล้ว หรือไม่พบการประเมินที่รอดำเนินการ')
  const row = data as RecordRow
  await writeAudit(actor, 'receiving.assessment.complete', 'stock-receipt-assessment', asString(row.id), {
    receiptId,
    vendorId: asString(row.vendor_id),
    ...answers,
  })
  return getReceivingWorkspace(actor)
}
