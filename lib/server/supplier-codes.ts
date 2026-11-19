import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import type { SupplierCodeCreateInput, SupplierCodeReviewInput } from '@/lib/receiving/api-schemas'
import { normalizeSupplierCode, type SupplierCodeAlias } from '@/lib/receiving/supplier-bill'
import type { SupplierCodeStatus, SupplierItemCode } from '@/lib/receiving/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
const TABLE = 'bm_supplier_item_codes'

function fail(error: { message: string } | null) {
  if (error) throw new HttpError(500, error.message || 'Supplier code operation failed')
}
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const nullable = (value: unknown) => (typeof value === 'string' ? value : null)

/** Pending + approved mappings, newest first, with requester/reviewer names. */
export async function listSupplierCodes(): Promise<SupplierItemCode[]> {
  const admin = getAdminClient()
  const { data, error } = await admin.from(TABLE).select('*').in('status', ['pending', 'approved']).order('requested_at', { ascending: false }).limit(2000)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const userIds = [...new Set(rows.flatMap((row) => [str(row.requested_by), str(row.reviewed_by)]).filter(Boolean))]
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data: users, error: userError } = await admin.from('nipt_users').select('id,display_name').in('id', userIds)
    fail(userError)
    for (const user of (users ?? []) as RecordRow[]) names.set(str(user.id), str(user.display_name))
  }
  return rows.map((row) => ({
    id: str(row.id),
    vendorId: str(row.vendor_id),
    codeKind: str(row.code_kind) === 'material' ? 'material' : 'rdth',
    codeRaw: str(row.code_raw),
    codeNormalized: str(row.code_normalized),
    stockItemId: str(row.stock_item_id),
    descriptionText: nullable(row.description_text),
    status: str(row.status) as SupplierCodeStatus,
    requestedBy: str(row.requested_by),
    requestedByName: names.get(str(row.requested_by)) ?? null,
    requestedAt: str(row.requested_at),
    reviewedBy: nullable(row.reviewed_by),
    reviewedByName: names.get(str(row.reviewed_by)) ?? null,
    reviewedAt: nullable(row.reviewed_at),
    reviewNote: nullable(row.review_note),
  }))
}

/** Only approved mappings take part in matching. */
export async function approvedSupplierCodeAliases(vendorId: string): Promise<SupplierCodeAlias[]> {
  const { data, error } = await getAdminClient().from(TABLE).select('code_kind,code_normalized,stock_item_id').eq('vendor_id', vendorId).eq('status', 'approved')
  fail(error)
  return ((data ?? []) as RecordRow[]).map((row) => ({ codeKind: str(row.code_kind) === 'material' ? 'material' : 'rdth', codeNormalized: str(row.code_normalized), stockItemId: str(row.stock_item_id) }))
}

/**
 * Remembers RDTH Code / Material No. → item for one Vendor. Admin mappings are
 * approved at once; Staff mappings wait in the approval queue. A code already
 * bound to a different item (by mapping or by Item Master REF) is refused.
 */
export async function requestSupplierCodes(input: SupplierCodeCreateInput, actor: BmActor): Promise<{ status: 'approved' | 'pending' }> {
  const admin = getAdminClient()
  const [{ data: vendor, error: vendorError }, { data: item, error: itemError }] = await Promise.all([
    admin.from('bm_vendors').select('id,is_active').eq('id', input.vendorId).maybeSingle(),
    admin.from('bm_stock_items').select('id,is_active').eq('id', input.stockItemId).maybeSingle(),
  ])
  fail(vendorError)
  fail(itemError)
  if (!vendor || !(vendor as RecordRow).is_active) throw new HttpError(404, 'ไม่พบ Vendor ที่ใช้งานอยู่')
  if (!item || !(item as RecordRow).is_active) throw new HttpError(404, 'ไม่พบสินค้าที่ใช้งานอยู่ใน Item Master')

  const codes = ([['rdth', input.rdthCode], ['material', input.materialNo]] as const)
    .map(([kind, raw]) => ({ kind, raw: (raw ?? '').trim(), normalized: normalizeSupplierCode(raw) }))
    .filter((code) => code.raw)
  if (codes.some((code) => !code.normalized || code.normalized.length > 120)) throw new HttpError(400, 'รหัสผู้ขายไม่ถูกต้อง')

  // A code that is already some other item's REF / item code would make matching ambiguous.
  const { data: masterRows, error: masterError } = await admin.from('bm_stock_items').select('id,item_code,catalog_no').eq('is_active', true)
  fail(masterError)
  for (const code of codes) {
    const clash = ((masterRows ?? []) as RecordRow[]).find((row) => str(row.id) !== input.stockItemId && (normalizeSupplierCode(nullable(row.catalog_no)) === code.normalized || normalizeSupplierCode(str(row.item_code)) === code.normalized))
    if (clash) throw new HttpError(409, `รหัส ${code.raw} ตรงกับ REF/รหัสของสินค้าอื่นใน Item Master (${str(clash.item_code)}) — กรุณาแก้ทะเบียนสินค้าแทนการจับคู่`)
  }

  const isAdmin = actor.role === 'Admin'
  const now = new Date().toISOString()
  const { data: liveRows, error: liveError } = await admin.from(TABLE).select('id,code_kind,code_normalized,stock_item_id,status')
    .eq('vendor_id', input.vendorId).in('status', ['pending', 'approved']).in('code_normalized', codes.map((code) => code.normalized))
  fail(liveError)
  const live = (liveRows ?? []) as RecordRow[]

  let anyPending = false
  for (const code of codes) {
    const existing = live.find((row) => str(row.code_kind) === code.kind && str(row.code_normalized) === code.normalized)
    if (existing && str(existing.stock_item_id) !== input.stockItemId)
      throw new HttpError(409, `รหัส ${code.raw} ผูกกับสินค้าอื่นไว้แล้ว${str(existing.status) === 'pending' ? ' (รออนุมัติ)' : ''} — ให้ Admin ยกเลิกการจับคู่เดิมก่อน`)
    if (existing && str(existing.status) === 'approved') continue
    if (existing) {
      // Same mapping already waiting: an Admin approves it now; Staff just keeps waiting.
      if (!isAdmin) { anyPending = true; continue }
      const { error } = await admin.from(TABLE).update({ status: 'approved', reviewed_by: actor.id, reviewed_at: now, updated_at: now }).eq('id', str(existing.id)).eq('status', 'pending')
      fail(error)
      await writeAudit(actor, 'receiving.supplier-code.approve', 'supplier-item-code', str(existing.id), { vendorId: input.vendorId, code: code.normalized, kind: code.kind })
      continue
    }
    const { data: inserted, error } = await admin.from(TABLE).insert({
      vendor_id: input.vendorId,
      code_kind: code.kind,
      code_raw: code.raw,
      code_normalized: code.normalized,
      stock_item_id: input.stockItemId,
      description_text: input.description?.trim() || null,
      status: isAdmin ? 'approved' : 'pending',
      requested_by: actor.id,
      reviewed_by: isAdmin ? actor.id : null,
      reviewed_at: isAdmin ? now : null,
    }).select('id').single()
    if (error?.code === '23505') throw new HttpError(409, `รหัส ${code.raw} ถูกจับคู่ไปแล้วโดยผู้ใช้อื่น — โหลดหน้าใหม่แล้วตรวจอีกครั้ง`)
    fail(error)
    if (!isAdmin) anyPending = true
    await writeAudit(actor, isAdmin ? 'receiving.supplier-code.create' : 'receiving.supplier-code.request', 'supplier-item-code', str((inserted as RecordRow).id), { vendorId: input.vendorId, stockItemId: input.stockItemId, code: code.normalized, kind: code.kind })
  }
  return { status: anyPending ? 'pending' : 'approved' }
}

/** Admin review: approve/reject a pending mapping, or revoke an approved one. */
export async function reviewSupplierCode(id: string, input: SupplierCodeReviewInput, actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
  const expected = input.action === 'revoke' ? 'approved' : 'pending'
  const status = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'revoked'
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient().from(TABLE)
    .update({ status, reviewed_by: actor.id, reviewed_at: now, review_note: input.note?.trim() || null, updated_at: now })
    .eq('id', id).eq('status', expected).select('id,vendor_id,code_normalized,code_kind').maybeSingle()
  fail(error)
  if (!data) throw new HttpError(409, input.action === 'revoke' ? 'การจับคู่นี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว' : 'รายการนี้ไม่ได้รออนุมัติแล้ว — โหลดหน้าใหม่')
  const row = data as RecordRow
  await writeAudit(actor, `receiving.supplier-code.${input.action}`, 'supplier-item-code', id, { vendorId: str(row.vendor_id), code: str(row.code_normalized), kind: str(row.code_kind), note: input.note ?? null })
}
