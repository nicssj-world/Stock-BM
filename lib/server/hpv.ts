import 'server-only'

import { addOneMonth, nextHpvBoxPosition, summarizeHpvSites } from '@/lib/hpv/rules'
import type { BmActor } from '@/lib/bm/types'
import type {
  HpvBoxType,
  HpvDashboard,
  HpvKitDistribution,
  HpvSample,
  HpvSite,
  HpvSiteReceipt,
  HpvStorageBox,
  HpvWorkspace,
} from '@/lib/hpv/types'
import { todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getStockWorkspace } from '@/lib/server/stock'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'HPV database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown) {
  return Number(value ?? 0)
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function siteFromRow(row: RecordRow): HpvSite {
  return {
    id: asString(row.id),
    code: nullableString(row.code),
    name: asString(row.name),
    siteType: asString(row.site_type),
    isActive: Boolean(row.is_active),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function siteName(row: RecordRow) {
  const nested = row.bm_hpv_sites as RecordRow | null
  return asString(nested?.name)
}

function distributionFromRow(row: RecordRow, names: Map<string, string>): HpvKitDistribution {
  const lot = row.bm_stock_lots as RecordRow | null
  const item = lot?.bm_stock_items as RecordRow | null
  const location = row.bm_stock_locations as RecordRow | null
  return {
    id: asString(row.id),
    siteId: asString(row.site_id),
    siteName: siteName(row),
    distributedOn: asString(row.distributed_on),
    quantity: asNumber(row.quantity),
    stockLotId: asString(row.stock_lot_id),
    stockLocationId: asString(row.stock_location_id),
    stockTransactionId: asString(row.stock_transaction_id),
    itemCode: nullableString(item?.item_code),
    itemName: nullableString(item?.name),
    lotNumber: nullableString(lot?.lot_number),
    locationCode: nullableString(location?.code),
    note: nullableString(row.note),
    createdByName: names.get(asString(row.created_by)) ?? null,
    createdAt: asString(row.created_at),
  }
}

function receiptFromRow(row: RecordRow, names: Map<string, string>): HpvSiteReceipt {
  return {
    id: asString(row.id),
    siteId: asString(row.site_id),
    siteName: siteName(row),
    receivedOn: asString(row.received_on),
    sampleCount: asNumber(row.sample_count),
    note: nullableString(row.note),
    createdByName: names.get(asString(row.created_by)) ?? null,
    createdAt: asString(row.created_at),
  }
}

function sampleFromRow(row: RecordRow, names: Map<string, string>): HpvSample {
  return {
    id: asString(row.id),
    barcode: asString(row.barcode),
    boxId: asString(row.box_id),
    position: asNumber(row.position),
    status: asString(row.status) as HpvSample['status'],
    storedAt: asString(row.stored_at),
    storedByName: names.get(asString(row.stored_by)) ?? null,
    checkedOutAt: nullableString(row.checked_out_at),
    checkedOutByName: names.get(asString(row.checked_out_by)) ?? null,
    checkoutDestination: nullableString(row.checkout_destination),
    checkoutNote: nullableString(row.checkout_note),
  }
}

function boxFromRow(row: RecordRow, samples: HpvSample[]): HpvStorageBox {
  return {
    id: asString(row.id),
    boxCode: asString(row.box_code),
    boxType: asString(row.box_type) as HpvBoxType,
    capacity: asNumber(row.capacity),
    status: asString(row.status) as HpvStorageBox['status'],
    filledAt: nullableString(row.filled_at),
    destroyDueAt: nullableString(row.destroy_due_at),
    destroyedAt: nullableString(row.destroyed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    samples: samples.sort((a, b) => a.position - b.position),
  }
}

export async function getHpvWorkspace(actor: BmActor): Promise<HpvWorkspace> {
  const admin = getAdminClient()
  const [
    { data: siteData, error: siteError },
    { data: distributionData, error: distributionError },
    { data: receiptData, error: receiptError },
    { data: boxData, error: boxError },
    { data: sampleData, error: sampleError },
    stock,
  ] = await Promise.all([
    admin.from('bm_hpv_sites').select('*').order('name'),
    admin
      .from('bm_hpv_kit_distributions')
      .select('*, bm_hpv_sites(name), bm_stock_lots(lot_number, bm_stock_items(item_code, name)), bm_stock_locations(code)')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('bm_hpv_site_receipts').select('*, bm_hpv_sites(name)').order('created_at', { ascending: false }).limit(200),
    admin.from('bm_hpv_storage_boxes').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('bm_hpv_samples').select('*').order('stored_at', { ascending: false }).limit(2500),
    getStockWorkspace(actor),
  ])
  fail(siteError)
  fail(distributionError)
  fail(receiptError)
  fail(boxError)
  fail(sampleError)

  const siteRows = (siteData ?? []) as RecordRow[]
  const distributionRows = (distributionData ?? []) as RecordRow[]
  const receiptRows = (receiptData ?? []) as RecordRow[]
  const sampleRows = (sampleData ?? []) as RecordRow[]
  const boxRows = (boxData ?? []) as RecordRow[]
  const names = await getNameMap([
    ...distributionRows.map((row) => asString(row.created_by)),
    ...receiptRows.map((row) => asString(row.created_by)),
    ...sampleRows.map((row) => asString(row.stored_by)),
    ...sampleRows.map((row) => asString(row.checked_out_by)),
  ])

  const samples = sampleRows.map((row) => sampleFromRow(row, names))
  const samplesByBox = new Map<string, HpvSample[]>()
  for (const sample of samples) samplesByBox.set(sample.boxId, [...(samplesByBox.get(sample.boxId) ?? []), sample])
  const distributions = distributionRows.map((row) => distributionFromRow(row, names))
  const receipts = receiptRows.map((row) => receiptFromRow(row, names))
  const summaryMap = summarizeHpvSites(distributions, receipts)

  return {
    sites: siteRows.map(siteFromRow),
    summaries: Object.values(summaryMap).sort((a, b) => b.outstanding - a.outstanding),
    distributions,
    receipts,
    boxes: boxRows.map((row) => boxFromRow(row, samplesByBox.get(asString(row.id)) ?? [])),
    stock,
  }
}

export async function createHpvSite(input: { code?: string | null; name: string; siteType?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_hpv_sites')
    .insert({ code: clean(input.code), name: input.name.trim(), site_type: clean(input.siteType) ?? 'รพ.สต.', created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'hpv.site.create', 'hpv-site', asString((data as RecordRow).id), input)
  return getHpvWorkspace(actor)
}

export async function updateHpvSite(input: { id: string; code?: string | null; name?: string; siteType?: string | null; isActive?: boolean }, actor: BmActor) {
  assertAdmin(actor)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.code !== undefined) updates.code = clean(input.code)
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.siteType !== undefined) updates.site_type = clean(input.siteType) ?? 'รพ.สต.'
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { error } = await getAdminClient().from('bm_hpv_sites').update(updates).eq('id', input.id)
  fail(error)
  await writeAudit(actor, 'hpv.site.update', 'hpv-site', input.id, input)
  return getHpvWorkspace(actor)
}

export async function cancelHpvDistribution(id: string, reason: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: distribution, error: distError } = await admin
    .from('bm_hpv_kit_distributions')
    .select('stock_transaction_id, site_id, quantity')
    .eq('id', id)
    .maybeSingle()
  fail(distError)
  const distRow = distribution as RecordRow | null
  if (!distRow) throw new HttpError(404, 'Distribution not found')

  const stockTransactionId = asString(distRow.stock_transaction_id)
  const { data: alreadyReversed, error: revCheckError } = await admin
    .from('bm_stock_transactions')
    .select('id')
    .eq('source_transaction_id', stockTransactionId)
    .maybeSingle()
  fail(revCheckError)
  if (alreadyReversed) throw new HttpError(409, 'Stock transaction ถูก reverse ไปแล้ว')

  const { error: reverseError } = await admin.rpc('reverse_bm_stock_transaction', {
    p_transaction: stockTransactionId,
    p_reason: `ยกเลิก HPV distribution: ${reason.trim()}`,
    p_actor: actor.id,
  })
  fail(reverseError)

  const { error } = await admin.from('bm_hpv_kit_distributions').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'hpv.distribution.cancel', 'hpv-distribution', id, { reason })
  return getHpvWorkspace(actor)
}

export async function createHpvDistribution(input: {
  siteId: string
  distributedOn: string
  lotId: string
  locationId: string
  quantity: number
  note?: string | null
  overrideReason?: string | null
}, actor: BmActor) {
  const admin = getAdminClient()
  const { data: site, error: siteError } = await admin.from('bm_hpv_sites').select('id,name,code,is_active').eq('id', input.siteId).maybeSingle()
  fail(siteError)
  const siteRow = site as RecordRow | null
  if (!siteRow?.is_active) throw new HttpError(400, 'Active HPV site not found')

  const { data: transactionId, error: issueError } = await admin.rpc('issue_bm_stock', {
    p_lot: input.lotId,
    p_location: input.locationId,
    p_quantity: input.quantity,
    p_purpose_text: `HPV kit distribution: ${asString(siteRow.name)}`,
    p_reference_text: `HPV-${input.distributedOn}-${asString(siteRow.code) || asString(siteRow.name)}`,
    p_note: clean(input.note),
    p_override_reason: clean(input.overrideReason),
    p_expired_confirmed: false,
    p_actor: actor.id,
  })
  fail(issueError)

  const txId = asString(transactionId)
  const { data, error } = await admin
    .from('bm_hpv_kit_distributions')
    .insert({
      site_id: input.siteId,
      distributed_on: input.distributedOn,
      quantity: input.quantity,
      stock_lot_id: input.lotId,
      stock_location_id: input.locationId,
      stock_transaction_id: txId,
      note: clean(input.note),
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'hpv.distribution.create', 'hpv-distribution', asString((data as RecordRow).id), { ...input, stockTransactionId: txId })
  return getHpvWorkspace(actor)
}

export async function updateHpvReceipt(input: { id: string; receivedOn?: string; sampleCount?: number; note?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const updates: Record<string, unknown> = {}
  if (input.receivedOn !== undefined) updates.received_on = input.receivedOn
  if (input.sampleCount !== undefined) updates.sample_count = input.sampleCount
  if (input.note !== undefined) updates.note = clean(input.note)
  if (!Object.keys(updates).length) return getHpvWorkspace(actor)
  const { error } = await getAdminClient().from('bm_hpv_site_receipts').update(updates).eq('id', input.id)
  fail(error)
  await writeAudit(actor, 'hpv.receipt.update', 'hpv-receipt', input.id, input)
  return getHpvWorkspace(actor)
}

export async function createHpvReceipt(input: { siteId: string; receivedOn: string; sampleCount: number; note?: string | null }, actor: BmActor) {
  const { data, error } = await getAdminClient()
    .from('bm_hpv_site_receipts')
    .insert({
      site_id: input.siteId,
      received_on: input.receivedOn,
      sample_count: input.sampleCount,
      note: clean(input.note),
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'hpv.receipt.create', 'hpv-receipt', asString((data as RecordRow).id), input)
  return getHpvWorkspace(actor)
}

export async function createHpvStorageBox(input: { boxCode: string; boxType: HpvBoxType }, actor: BmActor) {
  const { data, error } = await getAdminClient()
    .from('bm_hpv_storage_boxes')
    .insert({ box_code: input.boxCode.trim(), box_type: input.boxType, created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'hpv.box.create', 'hpv-box', asString((data as RecordRow).id), input)
  return getHpvWorkspace(actor)
}

export async function closeHpvStorageBox(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { data: box, error: boxError } = await getAdminClient().from('bm_hpv_storage_boxes').select('status').eq('id', id).maybeSingle()
  fail(boxError)
  if ((box as RecordRow | null)?.status !== 'open') throw new HttpError(400, 'ปิดได้เฉพาะกล่องที่ยังเปิดอยู่')
  const closedAt = new Date()
  const { error } = await getAdminClient()
    .from('bm_hpv_storage_boxes')
    .update({ status: 'full', filled_at: closedAt.toISOString(), destroy_due_at: addOneMonth(closedAt).toISOString(), updated_at: closedAt.toISOString() })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hpv.box.close', 'hpv-box', id, {})
  return getHpvWorkspace(actor)
}

export async function deleteHpvStorageBox(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { count, error: countError } = await getAdminClient()
    .from('bm_hpv_samples')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', id)
  fail(countError)
  if (count) throw new HttpError(409, 'ลบกล่องไม่ได้ มี sample อยู่ภายในกล่องนี้แล้ว')
  const { error } = await getAdminClient().from('bm_hpv_storage_boxes').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'hpv.box.delete', 'hpv-box', id, {})
  return getHpvWorkspace(actor)
}

export async function moveHpvSamplePosition(sampleId: string, targetPosition: number, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().rpc('move_hpv_sample_position', {
    p_sample_id: sampleId,
    p_target_position: targetPosition,
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'hpv.sample.move', 'hpv-sample', sampleId, { targetPosition })
  return getHpvWorkspace(actor)
}

export async function scanHpvSample(input: { barcode: string; boxId: string; position?: number | null }, actor: BmActor) {
  const admin = getAdminClient()
  const barcode = input.barcode.trim()
  const { data: existing, error: existingError } = await admin.from('bm_hpv_samples').select('id,status').eq('barcode', barcode).maybeSingle()
  fail(existingError)
  if (existing) throw new HttpError(409, 'Sample barcode already exists')

  const { data: box, error: boxError } = await admin.from('bm_hpv_storage_boxes').select('*').eq('id', input.boxId).maybeSingle()
  fail(boxError)
  const boxRow = box as RecordRow | null
  if (!boxRow || asString(boxRow.status) !== 'open') throw new HttpError(400, 'Open HPV storage box not found')

  const { data: sampleRows, error: sampleError } = await admin.from('bm_hpv_samples').select('position').eq('box_id', input.boxId)
  fail(sampleError)
  const occupied = ((sampleRows ?? []) as RecordRow[]).map((row) => asNumber(row.position))

  let position: number
  if (input.position) {
    if (occupied.includes(input.position)) throw new HttpError(409, `ตำแหน่งนี้มี sample อยู่แล้ว`)
    position = input.position
  } else {
    const auto = nextHpvBoxPosition(occupied, asNumber(boxRow.capacity))
    if (!auto) throw new HttpError(409, 'HPV storage box is full')
    position = auto
  }

  const { data, error } = await admin
    .from('bm_hpv_samples')
    .insert({ barcode, box_id: input.boxId, position, stored_by: actor.id })
    .select('id')
    .single()
  fail(error)

  if (occupied.length + 1 >= asNumber(boxRow.capacity)) {
    const filledAt = new Date()
    const { error: updateError } = await admin
      .from('bm_hpv_storage_boxes')
      .update({
        status: 'full',
        filled_at: filledAt.toISOString(),
        destroy_due_at: addOneMonth(filledAt).toISOString(),
        updated_at: filledAt.toISOString(),
      })
      .eq('id', input.boxId)
    fail(updateError)
  }

  await writeAudit(actor, 'hpv.sample.store', 'hpv-sample', asString((data as RecordRow).id), { barcode, boxId: input.boxId, position })
  return getHpvWorkspace(actor)
}

export async function deleteHpvSample(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hpv_samples').select('id,box_id,barcode,status').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'HPV sample not found')
  if (asString(row.status) === 'checked_out') throw new HttpError(409, 'ลบ sample ที่ checkout แล้วไม่ได้')

  const { error } = await admin.from('bm_hpv_samples').delete().eq('id', id)
  fail(error)

  const boxId = asString(row.box_id)
  const { data: box, error: boxError } = await admin.from('bm_hpv_storage_boxes').select('status').eq('id', boxId).maybeSingle()
  fail(boxError)
  if ((box as RecordRow | null)?.status === 'full') {
    const { error: updateError } = await admin
      .from('bm_hpv_storage_boxes')
      .update({ status: 'open', filled_at: null, destroy_due_at: null, updated_at: new Date().toISOString() })
      .eq('id', boxId)
    fail(updateError)
  }

  await writeAudit(actor, 'hpv.sample.delete', 'hpv-sample', id, { barcode: asString(row.barcode), boxId })
  return getHpvWorkspace(actor)
}

export async function destroyHpvStorageBox(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { data: box, error: boxError } = await getAdminClient().from('bm_hpv_storage_boxes').select('status').eq('id', id).maybeSingle()
  fail(boxError)
  const boxRow = box as RecordRow | null
  if (!boxRow) throw new HttpError(404, 'Storage box not found')
  if (boxRow.status === 'open') throw new HttpError(400, 'ปิดกล่องก่อนจึงจะทำลายได้')
  if (boxRow.status === 'destroyed') throw new HttpError(400, 'กล่องนี้ทำลายไปแล้ว')
  const destroyedAt = new Date().toISOString()
  const { error } = await getAdminClient()
    .from('bm_hpv_storage_boxes')
    .update({ status: 'destroyed', destroyed_at: destroyedAt, destroyed_by: actor.id, updated_at: destroyedAt })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hpv.box.destroy', 'hpv-box', id, {})
  return getHpvWorkspace(actor)
}

export async function getHpvDashboardData(): Promise<HpvDashboard> {
  const admin = getAdminClient()
  const today = todayBangkok()
  const [{ count: storedCount }, { count: boxCount }] = await Promise.all([
    admin.from('bm_hpv_samples').select('*', { count: 'exact', head: true }).eq('status', 'stored'),
    admin.from('bm_hpv_storage_boxes').select('*', { count: 'exact', head: true }).lte('destroy_due_at', today).neq('status', 'destroyed'),
  ])
  return { storedSamples: storedCount ?? 0, boxesDueDestruction: boxCount ?? 0 }
}

export async function checkoutHpvSample(input: { barcode: string; destination?: string | null; note?: string | null }, actor: BmActor) {
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hpv_samples').select('id,status').eq('barcode', input.barcode.trim()).maybeSingle()
  fail(sampleError)
  const sampleRow = sample as RecordRow | null
  if (!sampleRow) throw new HttpError(404, 'HPV sample barcode not found')
  if (asString(sampleRow.status) !== 'stored') throw new HttpError(409, 'Only stored HPV samples can be checked out')

  const checkedOutAt = new Date().toISOString()
  const { error } = await admin
    .from('bm_hpv_samples')
    .update({
      status: 'checked_out',
      checked_out_at: checkedOutAt,
      checked_out_by: actor.id,
      checkout_destination: clean(input.destination) ?? 'Co-testing',
      checkout_note: clean(input.note),
    })
    .eq('id', asString(sampleRow.id))
  fail(error)
  await writeAudit(actor, 'hpv.sample.checkout', 'hpv-sample', asString(sampleRow.id), { barcode: input.barcode.trim(), destination: clean(input.destination) ?? 'Co-testing' })
  return getHpvWorkspace(actor)
}
