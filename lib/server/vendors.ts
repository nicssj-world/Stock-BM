import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import type { SupplierCandidate, Vendor, VendorIssue, VendorSignificantEvent } from '@/lib/receiving/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import type {
  VendorCreateInput, VendorIssueCreateInput, VendorIssueUpdateInput, VendorUpdateInput,
} from '@/lib/receiving/api-schemas'
import { getAdminClient } from '@/lib/supabase/admin'
import { buildVendorMetrics } from '@/lib/vendors/metrics'
import { vendorFiscalYearBounds } from '@/lib/vendors/fiscal-year'
import type { VendorPerformance } from '@/lib/vendors/types'

type RecordRow = Record<string, unknown>
type SupabaseError = { code?: string; message: string }

function fail(error: SupabaseError | null, message = 'Vendor database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function asIssueType(value: unknown): VendorIssue['issueType'] {
  const issueType = asString(value)
  return ['complaint', 'documentation_discrepancy', 'packaging_damage', 'temperature_out_of_range', 'quantity_discrepancy', 'expiry_non_compliant', 'other'].includes(issueType)
    ? issueType as VendorIssue['issueType']
    : 'other'
}

function asIssueStatus(value: unknown): VendorIssue['resolutionStatus'] {
  const status = asString(value)
  return status === 'resolved' || status === 'cancelled' ? status : 'open'
}

function toVendorIssue(row: RecordRow): VendorIssue {
  return {
    id: asString(row.id),
    vendorId: asString(row.vendor_id),
    receiptId: nullableString(row.receipt_id),
    receiptLineId: nullableString(row.receipt_line_id),
    issueType: asIssueType(row.issue_type),
    description: asString(row.description),
    resolutionStatus: asIssueStatus(row.resolution_status),
    resolutionNote: nullableString(row.resolution_note),
    openedBy: asString(row.opened_by),
    openedAt: asString(row.opened_at),
    resolvedBy: nullableString(row.resolved_by),
    resolvedAt: nullableString(row.resolved_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function toSignificantEvent(row: RecordRow): VendorSignificantEvent {
  return {
    id: asString(row.id),
    vendorId: asString(row.vendor_id),
    eventType: asString(row.event_type),
    severity: asString(row.severity) === 'critical' ? 'critical' : 'significant',
    eventDate: asString(row.event_date),
    description: asString(row.description),
    receiptId: nullableString(row.receipt_id),
    issueId: nullableString(row.issue_id),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
  }
}

function toVendor(row: RecordRow, itemCount: number): Vendor {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    taxId: nullableString(row.tax_id),
    address: nullableString(row.address),
    phone: nullableString(row.phone),
    email: nullableString(row.email),
    contactPerson: nullableString(row.contact_person),
    isActive: Boolean(row.is_active),
    note: nullableString(row.note),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    itemCount,
  }
}

async function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
}

function mapVendorInput(input: VendorCreateInput | VendorUpdateInput) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.code !== undefined) row.code = normalizeCode(input.code)
  if (input.name !== undefined) row.name = input.name.trim()
  if (input.taxId !== undefined) row.tax_id = clean(input.taxId)
  if (input.address !== undefined) row.address = clean(input.address)
  if (input.phone !== undefined) row.phone = clean(input.phone)
  if (input.email !== undefined) row.email = clean(input.email)
  if (input.contactPerson !== undefined) row.contact_person = clean(input.contactPerson)
  if (input.note !== undefined) row.note = clean(input.note)
  if ('isActive' in input && input.isActive !== undefined) row.is_active = input.isActive
  return row
}

export async function listVendors(): Promise<Vendor[]> {
  const admin = getAdminClient()
  const [{ data: vendorData, error: vendorError }, { data: linkData, error: linkError }] = await Promise.all([
    admin.from('bm_vendors').select('*').order('name'),
    admin.from('bm_stock_item_vendors').select('vendor_id'),
  ])
  fail(vendorError)
  fail(linkError)
  const counts = new Map<string, number>()
  for (const row of (linkData ?? []) as RecordRow[]) {
    const vendorId = asString(row.vendor_id)
    if (vendorId) counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1)
  }
  return ((vendorData ?? []) as RecordRow[]).map((row) => toVendor(row, counts.get(asString(row.id)) ?? 0))
}

export async function listSupplierCandidates(): Promise<SupplierCandidate[]> {
  const { data, error } = await getAdminClient().from('bm_stock_items').select('supplier,item_code').not('supplier', 'is', null).order('supplier')
  fail(error)
  const grouped = new Map<string, { itemCount: number; itemCodes: string[] }>()
  for (const row of (data ?? []) as RecordRow[]) {
    const supplier = asString(row.supplier).trim()
    if (!supplier) continue
    const current = grouped.get(supplier) ?? { itemCount: 0, itemCodes: [] }
    current.itemCount += 1
    const itemCode = asString(row.item_code)
    if (itemCode) current.itemCodes.push(itemCode)
    grouped.set(supplier, current)
  }
  return [...grouped.entries()].map(([supplier, value]) => ({ supplier, ...value }))
}

export async function createVendor(input: VendorCreateInput, actor: BmActor) {
  await assertAdmin(actor)
  const row: Record<string, unknown> = {
    ...mapVendorInput(input),
    created_by: actor.id,
  }
  const { data, error } = await getAdminClient().from('bm_vendors').insert(row).select('*').single()
  if (error?.code === '23505') throw new HttpError(409, 'รหัส vendor นี้มีอยู่แล้ว')
  fail(error)
  const vendorId = asString((data as RecordRow).id)
  await writeAudit(actor, 'vendor.create', 'stock-vendor', vendorId, { code: row.code, name: row.name })
  return listVendors()
}

export async function updateVendor(id: string, input: VendorUpdateInput, actor: BmActor) {
  await assertAdmin(actor)
  const updates = mapVendorInput(input)
  const { data, error } = await getAdminClient().from('bm_vendors').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle()
  if (error?.code === '23505') throw new HttpError(409, 'รหัส vendor นี้มีอยู่แล้ว')
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบ vendor ที่ต้องการแก้ไข')
  await writeAudit(actor, 'vendor.update', 'stock-vendor', id, input)
  return listVendors()
}

export async function deleteVendor(id: string, actor: BmActor) {
  await assertAdmin(actor)
  const { error } = await getAdminClient().from('bm_vendors').delete().eq('id', id)
  if (error && error.code === '23503') throw new HttpError(409, 'ลบ vendor ไม่ได้ เพราะมีข้อมูลรับเข้าหรือข้อมูลผูกพันอยู่ ให้ปิดใช้งานแทน')
  fail(error)
  await writeAudit(actor, 'vendor.delete', 'stock-vendor', id, {})
  return listVendors()
}

export async function listVendorIssues(vendorId: string) {
  const { data, error } = await getAdminClient()
    .from('bm_vendor_issues')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('opened_at', { ascending: false })
  fail(error)
  return ((data ?? []) as RecordRow[]).map(toVendorIssue)
}

export async function createVendorIssue(vendorId: string, input: VendorIssueCreateInput, actor: BmActor) {
  const { data, error } = await getAdminClient().from('bm_vendor_issues').insert({
    vendor_id: vendorId,
    issue_type: input.issueType,
    description: input.description.trim(),
    receipt_id: input.receiptId ?? null,
    receipt_line_id: input.receiptLineId ?? null,
    opened_by: actor.id,
  }).select('*').single()
  if (error?.code === '23503') throw new HttpError(404, 'ไม่พบ vendor หรือ receipt ที่ผูกไว้')
  fail(error)
  await writeAudit(actor, 'vendor.issue.create', 'stock-vendor-issue', asString((data as RecordRow).id), { vendorId, issueType: input.issueType })
  return listVendorIssues(vendorId)
}

export async function updateVendorIssue(vendorId: string, issueId: string, input: VendorIssueUpdateInput, actor: BmActor) {
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient().from('bm_vendor_issues').update({
    resolution_status: input.resolutionStatus,
    resolution_note: input.resolutionNote ?? null,
    resolved_by: input.resolutionStatus === 'open' ? null : actor.id,
    resolved_at: input.resolutionStatus === 'open' ? null : now,
    updated_at: now,
  }).eq('id', issueId).eq('vendor_id', vendorId).select('id').maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบ issue ของ vendor นี้')
  await writeAudit(actor, 'vendor.issue.resolve', 'stock-vendor-issue', issueId, { vendorId, resolutionStatus: input.resolutionStatus })
  return listVendorIssues(vendorId)
}

export async function getVendorPerformance(vendorId: string, fiscalYear: string): Promise<VendorPerformance> {
  const vendors = await listVendors()
  const vendor = vendors.find((item) => item.id === vendorId)
  if (!vendor) throw new HttpError(404, 'ไม่พบ vendor ที่ต้องการดูผลการปฏิบัติงาน')

  const bounds = vendorFiscalYearBounds(fiscalYear)
  const admin = getAdminClient()
  const [{ data: invoiceData, error: invoiceError }, { data: receiptData, error: receiptError }, { data: issueData, error: issueError }, { data: eventData, error: eventError }, { data: mappingData, error: mappingError }] = await Promise.all([
    admin.from('bm_invoices').select('id,invoice_date,status').eq('vendor_id', vendorId).gte('invoice_date', bounds.from).lte('invoice_date', bounds.to),
    admin.from('bm_receipts').select('id,receipt_no,invoice_id,received_date,status').eq('vendor_id', vendorId).gte('received_date', bounds.from).lte('received_date', bounds.to),
    admin.from('bm_vendor_issues').select('*').eq('vendor_id', vendorId).gte('opened_at', `${bounds.from}T00:00:00Z`).lte('opened_at', `${bounds.to}T23:59:59Z`).order('opened_at', { ascending: false }),
    admin.from('bm_vendor_significant_events').select('*').eq('vendor_id', vendorId).gte('event_date', bounds.from).lte('event_date', bounds.to).order('event_date', { ascending: false }),
    admin.from('bm_receiving_cold_chain_mappings').select('is_approved'),
  ])
  fail(invoiceError); fail(receiptError); fail(issueError); fail(eventError); fail(mappingError)

  const invoices = (invoiceData ?? []) as RecordRow[]
  const receipts = (receiptData ?? []) as RecordRow[]
  const invoiceIds = invoices.map((row) => asString(row.id)).filter(Boolean)
  const confirmedReceipts = receipts.filter((row) => asString(row.status) === 'confirmed')
  const confirmedReceiptIds = confirmedReceipts.map((row) => asString(row.id)).filter(Boolean)
  const [{ data: invoiceLineData, error: invoiceLineError }, { data: receiptLineData, error: receiptLineError }, { data: assessmentData, error: assessmentError }] = await Promise.all([
    invoiceIds.length ? admin.from('bm_invoice_lines').select('id,invoice_id,line_no,closure_state,expected_qty').in('invoice_id', invoiceIds) : Promise.resolve({ data: [], error: null }),
    confirmedReceiptIds.length ? admin.from('bm_receipt_lines').select('id,receipt_id,invoice_line_id,tor_expiry_compliance').in('receipt_id', confirmedReceiptIds) : Promise.resolve({ data: [], error: null }),
    confirmedReceiptIds.length ? admin.from('bm_receipt_assessments').select('*').in('receipt_id', confirmedReceiptIds) : Promise.resolve({ data: [], error: null }),
  ])
  fail(invoiceLineError); fail(receiptLineError); fail(assessmentError)

  const invoiceLineIds = ((invoiceLineData ?? []) as RecordRow[]).map((row) => asString(row.id)).filter(Boolean)
  // Received quantity per expected line comes from every confirmed receipt of
  // that line, even one received after the fiscal year closed.
  const { data: fulfilmentData, error: fulfilmentError } = invoiceLineIds.length
    ? await admin.from('bm_receipt_lines').select('invoice_line_id,received_qty,bm_receipts!inner(status)').in('invoice_line_id', invoiceLineIds).eq('bm_receipts.status', 'confirmed')
    : { data: [], error: null }
  fail(fulfilmentError)
  const receivedByInvoiceLine = new Map<string, number>()
  for (const row of (fulfilmentData ?? []) as RecordRow[]) {
    const lineId = asString(row.invoice_line_id)
    receivedByInvoiceLine.set(lineId, (receivedByInvoiceLine.get(lineId) ?? 0) + asNumber(row.received_qty))
  }

  const invoiceDates = new Map(invoices.map((row) => [asString(row.id), nullableString(row.invoice_date)]))
  const issueRows = ((issueData ?? []) as RecordRow[]).map(toVendorIssue)
  const eventRows = ((eventData ?? []) as RecordRow[]).map(toSignificantEvent)
  const assessmentRows = ((assessmentData ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    receiptId: asString(row.receipt_id),
    status: (asString(row.status) === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed',
    productCondition: nullableString(row.product_condition) as 'normal' | 'abnormal' | null,
    documentation: nullableString(row.documentation) as 'complete' | 'incomplete' | null,
    itemCorrectness: nullableString(row.item_correctness) as 'correct' | 'problem' | null,
    coldChainApplicable: row.cold_chain_applicable == null ? null : Boolean(row.cold_chain_applicable),
    coldChainCondition: nullableString(row.cold_chain_condition) as 'appropriate' | 'inappropriate' | null,
    hasComplaint: row.has_complaint == null ? null : Boolean(row.has_complaint),
    note: nullableString(row.note),
    assessedAt: nullableString(row.assessed_at),
  }))
  const assessmentByReceipt = new Map(assessmentRows.map((row) => [row.receiptId, row]))
  const receiptRows = receipts.map((row) => ({
    id: asString(row.id),
    receiptNo: nullableString(row.receipt_no),
    invoiceId: nullableString(row.invoice_id),
    receivedDate: asString(row.received_date),
    status: asString(row.status),
    assessmentStatus: assessmentByReceipt.get(asString(row.id))?.status ?? null,
  }))
  const receiptLineRows = ((receiptLineData ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    receiptId: asString(row.receipt_id),
    invoiceLineId: nullableString(row.invoice_line_id),
    compliance: asString(row.tor_expiry_compliance) as 'compliant' | 'not_compliant' | 'not_applicable',
  }))
  const invoiceLineRows = ((invoiceLineData ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    invoiceId: asString(row.invoice_id),
    lineNo: asNumber(row.line_no),
    closureState: asString(row.closure_state) as 'open' | 'complete' | 'short_closed' | 'cancelled',
    expectedQty: asNumber(row.expected_qty),
  }))
  const metrics = buildVendorMetrics({
    fiscalYear,
    completeDelivery: invoiceLineRows.map((row) => ({ id: row.id, closureState: row.closureState })),
    shelfLife: receiptLineRows.map((row) => ({ id: row.id, receiptId: row.receiptId, compliance: row.compliance })),
    assessments: assessmentRows,
    quantityLines: invoiceLineRows.filter((row) => row.closureState !== 'cancelled').map((row) => ({ id: row.id, expectedQty: row.expectedQty, receivedQty: receivedByInvoiceLine.get(row.id) ?? 0 })),
    issues: issueRows.map((row) => ({ id: row.id, receiptId: row.receiptId, issueType: row.issueType, resolutionStatus: row.resolutionStatus, openedAt: row.openedAt })),
    deliveryDates: receiptRows.filter((row) => row.status === 'confirmed').map((row) => ({ invoiceDate: row.invoiceId ? invoiceDates.get(row.invoiceId) ?? null : null, receivedDate: row.receivedDate })),
    coldChainMappingApproved: (mappingData ?? []).length > 0 && (mappingData ?? []).every((row) => Boolean((row as RecordRow).is_approved)),
  })

  return {
    vendor,
    fiscalYear,
    from: bounds.from,
    to: bounds.to,
    metrics,
    issues: issueRows,
    significantEvents: eventRows,
    receiptSources: receiptRows,
    assessmentSources: assessmentRows,
    receiptLineSources: receiptLineRows,
    invoiceLineSources: invoiceLineRows,
    metricKeys: Object.values(metrics.metrics).map((metric) => metric.key),
  }
}
