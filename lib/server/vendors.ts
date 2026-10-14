import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import type { ReceiptAssessment } from '@/lib/receiving/assessment'
import type { SupplierCandidate, Vendor } from '@/lib/receiving/types'
import type { VendorCreateInput, VendorIssueCreateInput, VendorIssueUpdateInput, VendorUpdateInput } from '@/lib/receiving/api-schemas'
import { toAssessment } from '@/lib/server/assessment-mapper'
import { HttpError } from '@/lib/server/errors'
import { throwRpcError } from '@/lib/server/vendor-errors'
import { getAdminClient } from '@/lib/supabase/admin'
import type { VendorIssue, VendorIssueType } from '@/lib/vendors/issues'
import type { Snapshot } from '@/lib/vendors/evaluation'

type RecordRow = Record<string, unknown>
type SupabaseError = { code?: string; message: string }

function fail(error: SupabaseError | null, message = 'Vendor database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null)

function toVendorIssue(row: RecordRow): VendorIssue {
  return {
    id: asString(row.id),
    vendorId: asString(row.vendor_id),
    invoiceId: nullableString(row.invoice_id),
    receiptId: nullableString(row.receipt_id),
    issueType: asString(row.issue_type) as VendorIssueType,
    sourceKind: asString(row.source_kind) as VendorIssue['sourceKind'],
    description: asString(row.description),
    status: asString(row.resolution_status) as VendorIssue['status'],
    resolutionAction: nullableString(row.resolution_action),
    resolutionNote: nullableString(row.resolution_note),
    cancelledReason: nullableString(row.cancelled_reason),
    cancelledNote: nullableString(row.cancelled_note),
    openedAt: asString(row.opened_at),
    resolvedAt: nullableString(row.resolved_at),
    cancelledAt: nullableString(row.cancelled_at),
  }
}

function toVendor(row: RecordRow, itemCount: number): Vendor {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    legalName: nullableString(row.legal_name),
    taxId: nullableString(row.tax_id),
    taxBranchCode: asString(row.tax_branch_code) || '00000',
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

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getAdminClient().rpc(name, args)
  throwRpcError(error)
  return data as T
}

/** JSON body for the vendor RPCs: only keys the caller sent, blanks clear a field. */
function vendorPayload(input: VendorCreateInput | VendorUpdateInput) {
  const payload: Record<string, string | null> = {}
  const set = (key: string, value: string | null | undefined) => { if (value !== undefined) payload[key] = value === null ? '' : value }
  set('code', input.code)
  set('name', input.name)
  set('legalName', input.legalName)
  set('taxId', input.taxId)
  set('taxBranchCode', input.taxBranchCode)
  set('address', input.address)
  set('phone', input.phone)
  set('email', input.email)
  set('contactPerson', input.contactPerson)
  set('note', input.note)
  return payload
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

export async function getVendor(id: string): Promise<Vendor> {
  const vendor = (await listVendors()).find((item) => item.id === id)
  if (!vendor) throw new HttpError(404, 'ไม่พบผู้ขาย')
  return vendor
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
  await rpc('create_bm_vendor', { p_actor: actor.id, p_data: vendorPayload(input) })
  return listVendors()
}

export async function updateVendor(id: string, input: VendorUpdateInput, actor: BmActor) {
  const payload = vendorPayload(input)
  if (Object.keys(payload).length > 0) {
    // A save with no expected timestamp reads the current one, so an admin tool call is never blocked by an older form.
    const expected = input.expectedUpdatedAt ?? (await getVendor(id)).updatedAt
    await rpc('update_bm_vendor', { p_actor: actor.id, p_id: id, p_data: payload, p_expected_updated_at: expected })
  }
  if (input.isActive !== undefined) {
    await rpc('set_bm_vendor_active', { p_actor: actor.id, p_id: id, p_active: input.isActive, p_note: input.deactivateNote ?? null })
  }
  return listVendors()
}

export async function deleteVendor(id: string, actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
  const { error } = await getAdminClient().from('bm_vendors').delete().eq('id', id)
  if (error && error.code === '23503') throw new HttpError(409, 'ลบ vendor ไม่ได้ เพราะมีข้อมูลรับเข้าหรือข้อมูลผูกพันอยู่ ให้ปิดใช้งานแทน')
  fail(error)
  const { error: auditError } = await getAdminClient().from('bm_audit_logs').insert({ actor_id: actor.id, action: 'vendor.delete', entity_type: 'stock-vendor', entity_id: id, detail: {} })
  fail(auditError)
  return listVendors()
}

export async function listVendorIssues(vendorId: string) {
  const { data, error } = await getAdminClient().from('bm_vendor_issues').select('*').eq('vendor_id', vendorId).order('opened_at', { ascending: false }).limit(300)
  fail(error)
  return ((data ?? []) as RecordRow[]).map(toVendorIssue)
}

export async function createVendorIssue(vendorId: string, input: VendorIssueCreateInput, actor: BmActor) {
  await rpc('open_bm_vendor_issue', {
    p_actor: actor.id, p_vendor: vendorId, p_issue_type: input.issueType, p_description: input.description,
    p_receipt: input.receiptId ?? null, p_invoice: input.invoiceId ?? null,
  })
  return listVendorIssues(vendorId)
}

export async function updateVendorIssue(vendorId: string, issueId: string, input: VendorIssueUpdateInput, actor: BmActor) {
  const { data, error } = await getAdminClient().from('bm_vendor_issues').select('id').eq('id', issueId).eq('vendor_id', vendorId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบปัญหาของผู้ขายนี้')
  if (input.action === 'resolve') {
    await rpc('resolve_bm_vendor_issue', { p_actor: actor.id, p_id: issueId, p_action: input.resolutionAction, p_note: input.note })
  } else {
    await rpc('cancel_bm_vendor_issue', { p_actor: actor.id, p_id: issueId, p_reason: input.reason, p_note: input.note ?? null })
  }
  return listVendorIssues(vendorId)
}

// ---- Vendor page data -----------------------------------------------------------------------------------------------

export type VendorReceiptEvent = {
  receiptId: string
  eventNumber: string | null
  invoiceNumber: string | null
  receivedAt: string
  assessment: ReceiptAssessment | null
  revisionCount: number
  lastRevisionAt: string | null
}

/** Confirmed receipts of a vendor with their event number and assessment, newest first. */
export async function listVendorReceiptEvents(vendorId: string, page = 1, pageSize = 20): Promise<{events:VendorReceiptEvent[];total:number}> {
  const offset = (Math.max(1,page)-1)*pageSize
  const admin = getAdminClient()
  const { data, count, error } = await admin.from('bm_receipts')
    .select('id,received_at,bm_invoices(invoice_no),bm_receipt_event_numbers(event_number),bm_receipt_assessments(*)',{count:'exact'})
    .eq('vendor_id', vendorId).eq('status', 'confirmed').order('received_at', { ascending: false })
    .order('id', { ascending: false }).range(offset,offset+pageSize-1)
  fail(error)
  const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null)
  const rows = (data ?? []) as RecordRow[]
  const assessments = rows.map((row) => one(row.bm_receipt_assessments as RecordRow | RecordRow[] | null)).filter((a): a is RecordRow => Boolean(a))
  const ids = assessments.map((a) => asString(a.id))
  const revisions = new Map<string, { count: number; last: string | null }>()
  if (ids.length) {
    const { data: revisionData, error: revisionError } = await admin.from('bm_receipt_assessment_revisions').select('assessment_id,changed_at').in('assessment_id', ids).order('changed_at')
    fail(revisionError)
    for (const revision of (revisionData ?? []) as RecordRow[]) {
      const key = asString(revision.assessment_id)
      const current = revisions.get(key) ?? { count: 0, last: null }
      revisions.set(key, { count: current.count + 1, last: asString(revision.changed_at) })
    }
  }
  const events = rows.map((row) => {
    const assessmentRow = one(row.bm_receipt_assessments as RecordRow | RecordRow[] | null)
    const revision = assessmentRow ? revisions.get(asString(assessmentRow.id)) : undefined
    return {
      receiptId: asString(row.id),
      eventNumber: nullableString(one(row.bm_receipt_event_numbers as RecordRow | RecordRow[] | null)?.event_number),
      invoiceNumber: nullableString(one(row.bm_invoices as RecordRow | RecordRow[] | null)?.invoice_no),
      receivedAt: asString(row.received_at),
      assessment: assessmentRow ? toAssessment(assessmentRow) : null,
      revisionCount: revision?.count ?? 0,
      lastRevisionAt: revision?.last ?? null,
    }
  })
  return {events,total:count ?? 0}
}

export type PerformanceSnapshot = Omit<Snapshot, 'issues' | 'receipts' | 'assessments'>

/** Live performance for one vendor and Buddhist-era fiscal year: the same evidence the annual report freezes. */
export async function getVendorPerformanceSnapshot(vendorId: string, fiscalYear: number, actor: BmActor): Promise<PerformanceSnapshot> {
  return rpc<PerformanceSnapshot>('get_bm_vendor_performance', { p_actor: actor.id, p_vendor: vendorId, p_fiscal_year: fiscalYear })
}

export async function listVendorInvoices(vendorId: string, limit = 100) {
  const { data, error } = await getAdminClient().from('bm_invoices').select('id,invoice_no').eq('vendor_id', vendorId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(limit)
  fail(error)
  return ((data ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), invoiceNo: nullableString(row.invoice_no) }))
}

/** Evidence files are gathered while an issue is being worked: not by Assistants, and never on a closed issue. */
export async function assertVendorIssueAttachmentAllowed(actor: BmActor, issueId: string | null) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'Stock Staff or Admin permission required')
  if (!issueId) throw new HttpError(400, 'entityId is required')
  const { data, error } = await getAdminClient().from('bm_vendor_issues').select('resolution_status').eq('id', issueId).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบปัญหาผู้ขาย')
  if (asString((data as RecordRow).resolution_status) !== 'open') throw new HttpError(409, 'แนบหลักฐานได้เฉพาะปัญหาที่ยังเปิดอยู่')
}
