import 'server-only'

import { addOneMonth, nextHpvBoxPosition, summarizeHpvSites } from '@/lib/hpv/rules'
import type { BmActor } from '@/lib/bm/types'
import type {
  HpvBoxType,
  HpvKitDistribution,
  HpvSample,
  HpvSite,
  HpvSiteReceipt,
  HpvStorageBox,
  HpvWorkspace,
} from '@/lib/hpv/types'
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

export async function scanHpvSample(input: { barcode: string; boxId: string }, actor: BmActor) {
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
  const position = nextHpvBoxPosition(occupied, asNumber(boxRow.capacity))
  if (!position) throw new HttpError(409, 'HPV storage box is full')

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

export async function checkoutHpvSample(input: { barcode: string; note?: string | null }, actor: BmActor) {
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
      checkout_destination: 'Co-testing',
      checkout_note: clean(input.note),
    })
    .eq('id', asString(sampleRow.id))
  fail(error)
  await writeAudit(actor, 'hpv.sample.checkout', 'hpv-sample', asString(sampleRow.id), { barcode: input.barcode.trim(), destination: 'Co-testing' })
  return getHpvWorkspace(actor)
}
