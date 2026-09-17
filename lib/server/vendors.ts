import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import type { SupplierCandidate, Vendor } from '@/lib/receiving/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import type { VendorCreateInput, VendorUpdateInput } from '@/lib/receiving/api-schemas'
import { getAdminClient } from '@/lib/supabase/admin'

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
