import 'server-only'

import { addOneMonth, getHpvDestructionState, nextHpvBoxPosition, summarizeHpvSites } from '@/lib/hpv/rules'
import type { BmActor } from '@/lib/bm/types'
import type {
  HpvDashboard,
  HpvKitDistribution,
  HpvKitDistributionLine,
  HpvKitReturn,
  HpvKitReturnLine,
  HpvBoxStatus,
  HpvSample,
  HpvSpecimenType,
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

function distributionFromRow(row: RecordRow, names: Map<string, string>, linesByDistribution = new Map<string, HpvKitDistributionLine[]>()): HpvKitDistribution {
  const lot = row.bm_stock_lots as RecordRow | null
  const item = lot?.bm_stock_items as RecordRow | null
  const location = row.bm_stock_locations as RecordRow | null
  const nestedLines = Array.isArray(row.bm_hpv_kit_distribution_lines) ? row.bm_hpv_kit_distribution_lines as RecordRow[] : []
  const lines = linesByDistribution.get(asString(row.id)) ?? nestedLines.map(distributionLineFromRow)
  return {
    id: asString(row.id),
    siteId: asString(row.site_id),
    siteName: siteName(row),
    distributedOn: asString(row.distributed_on),
    kitType: nullableString(row.kit_type) as HpvKitDistribution['kitType'],
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
    lines: lines.length ? lines : [{
      id: null,
      distributionId: asString(row.id),
      stockLotId: asString(row.stock_lot_id),
      stockLocationId: asString(row.stock_location_id),
      itemCode: nullableString(item?.item_code),
      itemName: nullableString(item?.name),
      lotNumber: nullableString(lot?.lot_number),
      expiryDate: null,
      locationCode: nullableString(location?.code),
      unit: null,
      quantity: asNumber(row.quantity),
    }],
  }
}

function distributionLineFromRow(row: RecordRow): HpvKitDistributionLine {
  const lot = row.bm_stock_lots as RecordRow | null
  const item = lot?.bm_stock_items as RecordRow | null
  const location = row.bm_stock_locations as RecordRow | null
  return {
    id: nullableString(row.id),
    distributionId: asString(row.distribution_id),
    stockLotId: asString(row.stock_lot_id),
    stockLocationId: asString(row.stock_location_id),
    itemCode: nullableString(item?.item_code),
    itemName: nullableString(item?.name),
    lotNumber: nullableString(lot?.lot_number),
    expiryDate: nullableString(lot?.expiry_date),
    locationCode: nullableString(location?.code),
    unit: nullableString(item?.unit),
    quantity: asNumber(row.quantity),
  }
}

function kitReturnFromRow(row: RecordRow, names: Map<string, string>, linesByReturn = new Map<string, HpvKitReturnLine[]>()): HpvKitReturn {
  const id = asString(row.id)
  const lines = linesByReturn.get(id) ?? []
  const quantityByDistribution = new Map<string, number>()
  for (const line of lines) {
    quantityByDistribution.set(line.distributionId, Math.max(quantityByDistribution.get(line.distributionId) ?? 0, line.quantity))
  }
  return {
    id,
    siteId: asString(row.site_id),
    siteName: siteName(row),
    returnedOn: asString(row.returned_on),
    quantity: [...quantityByDistribution.values()].reduce((sum, quantity) => sum + quantity, 0),
    stockTransactionId: asString(row.stock_transaction_id),
    note: nullableString(row.note),
    createdByName: names.get(asString(row.created_by)) ?? null,
    createdAt: asString(row.created_at),
    lines,
  }
}

function receiptFromRow(row: RecordRow, names: Map<string, string>): HpvSiteReceipt {
  return {
    id: asString(row.id),
    siteId: asString(row.site_id),
    siteName: siteName(row),
    receivedOn: asString(row.received_on),
    sampleCount: asNumber(row.sample_count),
    selfSupplied: Boolean(row.self_supplied),
    note: nullableString(row.note),
    createdByName: names.get(asString(row.created_by)) ?? null,
    createdAt: asString(row.created_at),
  }
}

function sampleFromRow(row: RecordRow, names: Map<string, string>): HpvSample {
  return {
    id: asString(row.id),
    barcode: asString(row.barcode),
    specimenType: asString(row.specimen_type) as HpvSpecimenType,
    boxId: nullableString(row.box_id),
    position: row.position === null || row.position === undefined ? null : asNumber(row.position),
    fromStorageBox: row.from_storage_box !== false,
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
    capacity: asNumber(row.capacity),
    status: asString(row.status) as HpvStorageBox['status'],
    filledAt: nullableString(row.filled_at),
    destroyDueAt: nullableString(row.destroy_due_at),
    destroyedAt: nullableString(row.destroyed_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    samples: samples.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }
}

export async function getHpvWorkspace(actor: BmActor): Promise<HpvWorkspace> {
  const admin = getAdminClient()
  const [
    { data: siteData, error: siteError },
    { data: distributionData, error: distributionError },
    { data: distributionLineData, error: distributionLineError },
    { data: kitReturnData, error: kitReturnError },
    { data: kitReturnLineData, error: kitReturnLineError },
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
    admin.from('bm_hpv_kit_distribution_lines').select('*'),
    admin.from('bm_hpv_kit_returns').select('*, bm_hpv_sites(name)').order('created_at', { ascending: false }).limit(200),
    admin.from('bm_hpv_kit_return_lines').select('*'),
    admin.from('bm_hpv_site_receipts').select('*, bm_hpv_sites(name)').order('created_at', { ascending: false }).limit(200),
    admin.from('bm_hpv_storage_boxes').select('*').order('created_at', { ascending: false }).limit(100),
    admin.from('bm_hpv_samples').select('*').order('stored_at', { ascending: false }).limit(2500),
    getStockWorkspace(actor),
  ])
  fail(siteError)
  fail(distributionError)
  if (distributionLineError && !distributionLineError.message.includes('bm_hpv_kit_distribution_lines')) fail(distributionLineError)
  if (kitReturnError && !kitReturnError.message.includes('bm_hpv_kit_returns')) fail(kitReturnError)
  if (kitReturnLineError && !kitReturnLineError.message.includes('bm_hpv_kit_return_lines')) fail(kitReturnLineError)
  fail(receiptError)
  fail(boxError)
  fail(sampleError)

  const siteRows = (siteData ?? []) as RecordRow[]
  const distributionRows = (distributionData ?? []) as RecordRow[]
  const distributionLineRows = distributionLineError ? [] : (distributionLineData ?? []) as RecordRow[]
  const kitReturnRows = kitReturnError ? [] : (kitReturnData ?? []) as RecordRow[]
  const kitReturnLineRows = kitReturnLineError ? [] : (kitReturnLineData ?? []) as RecordRow[]
  const receiptRows = (receiptData ?? []) as RecordRow[]
  const sampleRows = (sampleData ?? []) as RecordRow[]
  const boxRows = (boxData ?? []) as RecordRow[]
  const names = await getNameMap([
    ...distributionRows.map((row) => asString(row.created_by)),
    ...kitReturnRows.map((row) => asString(row.created_by)),
    ...receiptRows.map((row) => asString(row.created_by)),
    ...sampleRows.map((row) => asString(row.stored_by)),
    ...sampleRows.map((row) => asString(row.checked_out_by)),
  ])

  const samples = sampleRows.map((row) => sampleFromRow(row, names))
  const samplesByBox = new Map<string, HpvSample[]>()
  const externalSamples: HpvSample[] = []
  for (const sample of samples) {
    if (sample.boxId) samplesByBox.set(sample.boxId, [...(samplesByBox.get(sample.boxId) ?? []), sample])
    else externalSamples.push(sample)
  }
  const locationsById = new Map(stock.locations.map((location) => [location.id, location]))
  const lotsById = new Map(stock.items.flatMap((item) => item.lots.map((lot) => [lot.id, { item, lot }] as const)))
  const linesByDistribution = new Map<string, HpvKitDistributionLine[]>()
  for (const row of distributionLineRows) {
    const distributionId = asString(row.distribution_id)
    const lotId = asString(row.stock_lot_id)
    const locationId = asString(row.stock_location_id)
    const lotInfo = lotsById.get(lotId)
    const locationInfo = locationsById.get(locationId)
    const line: HpvKitDistributionLine = {
      id: asString(row.id),
      distributionId,
      stockLotId: lotId,
      stockLocationId: locationId,
      itemCode: lotInfo?.item.itemCode ?? null,
      itemName: lotInfo?.item.name ?? null,
      lotNumber: lotInfo?.lot.lotNumber ?? null,
      expiryDate: lotInfo?.lot.expiryDate ?? null,
      locationCode: locationInfo?.code ?? null,
      unit: lotInfo?.item.unit ?? null,
      quantity: asNumber(row.quantity),
    }
    linesByDistribution.set(distributionId, [...(linesByDistribution.get(distributionId) ?? []), line])
  }
  const linesByReturn = new Map<string, HpvKitReturnLine[]>()
  for (const row of kitReturnLineRows) {
    const returnId = asString(row.return_id)
    const lotId = asString(row.stock_lot_id)
    const locationId = asString(row.stock_location_id)
    const lotInfo = lotsById.get(lotId)
    const locationInfo = locationsById.get(locationId)
    const line: HpvKitReturnLine = {
      id: asString(row.id),
      returnId,
      distributionId: asString(row.distribution_id),
      distributionLineId: nullableString(row.distribution_line_id),
      stockLotId: lotId,
      stockLocationId: locationId,
      itemCode: lotInfo?.item.itemCode ?? null,
      itemName: lotInfo?.item.name ?? null,
      lotNumber: lotInfo?.lot.lotNumber ?? null,
      expiryDate: lotInfo?.lot.expiryDate ?? null,
      locationCode: locationInfo?.code ?? null,
      unit: lotInfo?.item.unit ?? null,
      quantity: asNumber(row.quantity),
    }
    linesByReturn.set(returnId, [...(linesByReturn.get(returnId) ?? []), line])
  }
  const distributions = distributionRows.map((row) => distributionFromRow(row, names, linesByDistribution))
  const kitReturns = kitReturnRows.map((row) => kitReturnFromRow(row, names, linesByReturn))
  const receipts = receiptRows.map((row) => receiptFromRow(row, names))
  const summaryMap = summarizeHpvSites(distributions, receipts, kitReturns)
  const sites = siteRows.map(siteFromRow)
  for (const site of sites) {
    summaryMap[site.id] ??= { siteId: site.id, issued: 0, received: 0, receivedSelfSupplied: 0, returned: 0, outstanding: 0 }
  }

  return {
    sites,
    summaries: Object.values(summaryMap).sort((a, b) => b.outstanding - a.outstanding),
    distributions,
    kitReturns,
    receipts,
    boxes: boxRows.map((row) => boxFromRow(row, samplesByBox.get(asString(row.id)) ?? [])),
    externalSamples,
    stock,
  }
}

export async function createHpvSite(input: { code?: string | null; name: string; siteType?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_hpv_sites')
    .insert({
      code: clean(input.code),
      name: input.name.trim(),
      site_type: clean(input.siteType) ?? 'รพ.สต.',
      created_by: actor.id,
    })
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
  kitType: 'self_collected' | 'clinician_collected'
  quantity: number
  lines: { lotId: string; locationId: string }[]
  note?: string | null
  overrideReason?: string | null
}, actor: BmActor) {
  const admin = getAdminClient()
  const { data: site, error: siteError } = await admin.from('bm_hpv_sites').select('id,name,code,is_active,self_supplied').eq('id', input.siteId).maybeSingle()
  fail(siteError)
  const siteRow = site as RecordRow | null
  if (!siteRow?.is_active) throw new HttpError(400, 'Active HPV site not found')
  if (siteRow.self_supplied) throw new HttpError(400, 'หน่วยงานนี้ใช้ชุดตรวจตัวเอง จึงไม่ต้องเบิกจาก Stock กลาง')

  const kitColumn = input.kitType === 'self_collected' ? 'hpv_self_collected' : 'hpv_clinician_collected'
  const { data: requiredItems, error: itemError } = await admin
    .from('bm_stock_items')
    .select('id,item_code,name')
    .eq('is_active', true)
    .eq('is_hpv', true)
    .eq(kitColumn, true)
    .order('item_code')
  fail(itemError)
  const requiredItemRows = (requiredItems ?? []) as RecordRow[]
  if (!requiredItemRows.length) throw new HttpError(400, 'ยังไม่ได้กำหนด Stock item สำหรับหมวด HPV นี้')

  const lotIds = input.lines.map((line) => line.lotId)
  if (!lotIds.length) throw new HttpError(400, 'กรุณาเลือก lot สำหรับชุดเบิก')
  if (new Set(lotIds).size !== lotIds.length) throw new HttpError(400, 'เลือก lot ซ้ำในชุดเดียวกันไม่ได้')
  const { data: lotRowsData, error: lotError } = await admin
    .from('bm_stock_lots')
    .select('id,item_id,bm_stock_items(is_hpv,is_active,hpv_self_collected,hpv_clinician_collected)')
    .in('id', lotIds)
  fail(lotError)
  const lotRows = (lotRowsData ?? []) as RecordRow[]
  const lotById = new Map(lotRows.map((row) => [asString(row.id), row]))
  if (lotRows.length !== lotIds.length) throw new HttpError(400, 'พบ lot ที่ไม่ถูกต้องในชุดเบิก')

  const requiredItemIds = new Set(requiredItemRows.map((row) => asString(row.id)))
  const selectedItemIds = new Set<string>()
  for (const line of input.lines) {
    const lotRow = lotById.get(line.lotId)
    const itemRow = (lotRow?.bm_stock_items as RecordRow | null) ?? null
    const itemId = asString(lotRow?.item_id)
    if (!itemRow?.is_active) throw new HttpError(400, 'Active stock item not found')
    if (!itemRow.is_hpv) throw new HttpError(400, 'เลือกได้เฉพาะ Stock item ที่เชื่อมกับ HPV Management')
    if (input.kitType === 'self_collected' && !itemRow.hpv_self_collected) throw new HttpError(400, 'Stock item นี้ไม่ได้เชื่อมกับ HPV Self-collected')
    if (input.kitType === 'clinician_collected' && !itemRow.hpv_clinician_collected) throw new HttpError(400, 'Stock item นี้ไม่ได้เชื่อมกับ HPV Clinician-collected')
    if (!requiredItemIds.has(itemId)) throw new HttpError(400, 'Stock item ในชุดไม่ตรงกับหมวด HPV ที่เลือก')
    if (selectedItemIds.has(itemId)) throw new HttpError(400, 'เลือก lot ได้ item ละ 1 รายการต่อการเบิกหนึ่งครั้ง')
    selectedItemIds.add(itemId)
  }
  const missingItems = requiredItemRows.filter((row) => !selectedItemIds.has(asString(row.id)))
  if (missingItems.length) {
    throw new HttpError(400, `กรุณาเลือก lot ให้ครบทุก item ในชุด: ${missingItems.map((row) => asString(row.item_code)).join(', ')}`)
  }

  const issueLines = input.lines.map((line) => ({
    lot_id: line.lotId,
    location_id: line.locationId,
    quantity: input.quantity,
  }))
  const { data: transactionId, error: issueError } = await admin.rpc('issue_bm_stock_bundle', {
    p_lines: issueLines,
    p_purpose_text: `HPV kit distribution: ${asString(siteRow.name)}`,
    p_reference_text: `HPV-${input.distributedOn}-${asString(siteRow.code) || asString(siteRow.name)}`,
    p_note: clean(input.note),
    p_override_reason: clean(input.overrideReason),
    p_expired_confirmed: false,
    p_actor: actor.id,
  })
  fail(issueError)

  const txId = asString(transactionId)
  const primaryLine = input.lines[0]
  const { data, error } = await admin
    .from('bm_hpv_kit_distributions')
    .insert({
      site_id: input.siteId,
      distributed_on: input.distributedOn,
      kit_type: input.kitType,
      quantity: input.quantity,
      stock_lot_id: primaryLine.lotId,
      stock_location_id: primaryLine.locationId,
      stock_transaction_id: txId,
      note: clean(input.note),
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  const distributionId = asString((data as RecordRow).id)
  const { error: lineError } = await admin
    .from('bm_hpv_kit_distribution_lines')
    .insert(input.lines.map((line) => ({
      distribution_id: distributionId,
      stock_lot_id: line.lotId,
      stock_location_id: line.locationId,
      quantity: input.quantity,
    })))
  fail(lineError)
  await writeAudit(actor, 'hpv.distribution.create', 'hpv-distribution', distributionId, { ...input, stockTransactionId: txId })
  return { workspace: await getHpvWorkspace(actor), distributionId }
}

export async function updateHpvReceipt(input: { id: string; receivedOn?: string; sampleCount?: number; selfSupplied?: boolean; note?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const updates: Record<string, unknown> = {}
  if (input.receivedOn !== undefined) updates.received_on = input.receivedOn
  if (input.sampleCount !== undefined) updates.sample_count = input.sampleCount
  if (input.selfSupplied !== undefined) updates.self_supplied = input.selfSupplied
  if (input.note !== undefined) updates.note = clean(input.note)
  if (!Object.keys(updates).length) return getHpvWorkspace(actor)
  const { error } = await getAdminClient().from('bm_hpv_site_receipts').update(updates).eq('id', input.id)
  fail(error)
  await writeAudit(actor, 'hpv.receipt.update', 'hpv-receipt', input.id, input)
  return getHpvWorkspace(actor)
}

export async function createHpvReceipt(input: { siteId: string; receivedOn: string; sampleCount: number; selfSupplied?: boolean; note?: string | null }, actor: BmActor) {
  const { data, error } = await getAdminClient()
    .from('bm_hpv_site_receipts')
    .insert({
      site_id: input.siteId,
      received_on: input.receivedOn,
      sample_count: input.sampleCount,
      self_supplied: Boolean(input.selfSupplied),
      note: clean(input.note),
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'hpv.receipt.create', 'hpv-receipt', asString((data as RecordRow).id), input)
  return getHpvWorkspace(actor)
}

export async function createHpvKitReturn(input: {
  siteId: string
  returnedOn: string
  lines: {
    distributionId: string
    distributionLineId: string
    lotId: string
    locationId: string
    quantity: number
  }[]
  note?: string | null
}, actor: BmActor) {
  const admin = getAdminClient()
  const { data: site, error: siteError } = await admin
    .from('bm_hpv_sites')
    .select('id,name,code,is_active')
    .eq('id', input.siteId)
    .maybeSingle()
  fail(siteError)
  const siteRow = site as RecordRow | null
  if (!siteRow?.is_active) throw new HttpError(400, 'Active HPV site not found')

  if (!input.lines.length) throw new HttpError(400, 'Return lines are required')
  const distributionIds = [...new Set(input.lines.map((line) => line.distributionId))]
  const distributionLineIds = [...new Set(input.lines.map((line) => line.distributionLineId))]
  if (distributionLineIds.length !== input.lines.length) throw new HttpError(400, 'Return each issued line only once per save')

  for (const line of input.lines) {
    if (!line.distributionId || !line.distributionLineId || !line.lotId || !line.locationId) throw new HttpError(400, 'Return line is incomplete')
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new HttpError(400, 'Return quantity must be greater than zero')
  }

  const { data: distributionData, error: distributionError } = await admin
    .from('bm_hpv_kit_distributions')
    .select('id,site_id')
    .in('id', distributionIds)
  fail(distributionError)
  const distributions = (distributionData ?? []) as RecordRow[]
  if (distributions.length !== distributionIds.length) throw new HttpError(400, 'Selected HPV distribution was not found')
  for (const distribution of distributions) {
    if (asString(distribution.site_id) !== input.siteId) throw new HttpError(400, 'Return lines must belong to the selected site')
  }

  const { data: issuedLineData, error: issuedLineError } = await admin
    .from('bm_hpv_kit_distribution_lines')
    .select('id,distribution_id,stock_lot_id,stock_location_id,quantity')
    .in('distribution_id', distributionIds)
  fail(issuedLineError)
  const issuedLines = (issuedLineData ?? []) as RecordRow[]
  if (!issuedLines.length) throw new HttpError(400, 'Selected issued stock line was not found')
  const issuedLineById = new Map(issuedLines.map((row) => [asString(row.id), row]))
  const allIssuedLineIds = issuedLines.map((row) => asString(row.id))

  const { data: returnedLineData, error: returnedLineError } = await admin
    .from('bm_hpv_kit_return_lines')
    .select('distribution_line_id,quantity')
    .in('distribution_line_id', allIssuedLineIds)
  fail(returnedLineError)
  const returnedByLine = new Map<string, number>()
  for (const row of (returnedLineData ?? []) as RecordRow[]) {
    const key = asString(row.distribution_line_id)
    returnedByLine.set(key, (returnedByLine.get(key) ?? 0) + asNumber(row.quantity))
  }

  const selectedByDistribution = new Map<string, typeof input.lines>()
  for (const line of input.lines) {
    selectedByDistribution.set(line.distributionId, [...(selectedByDistribution.get(line.distributionId) ?? []), line])
  }
  for (const [distributionId, selectedLines] of selectedByDistribution) {
    const issuedForDistribution = issuedLines.filter((line) => asString(line.distribution_id) === distributionId)
    const returnableIssuedLines = issuedForDistribution.filter((line) => asNumber(line.quantity) - (returnedByLine.get(asString(line.id)) ?? 0) > 0)
    if (selectedLines.length !== returnableIssuedLines.length) {
      throw new HttpError(400, 'Return every stock item in the same HPV kit distribution together')
    }
    const quantities = new Set(selectedLines.map((line) => line.quantity))
    if (quantities.size !== 1) throw new HttpError(400, 'Return quantity must be the same for every stock item in the kit')
  }

  const rpcLines = input.lines.map((line) => {
    const issuedLine = issuedLineById.get(line.distributionLineId)
    if (!issuedLine) throw new HttpError(400, 'Selected issued stock line was not found')
    if (asString(issuedLine.distribution_id) !== line.distributionId) throw new HttpError(400, 'Return line does not match selected distribution')
    if (asString(issuedLine.stock_lot_id) !== line.lotId || asString(issuedLine.stock_location_id) !== line.locationId) {
      throw new HttpError(400, 'Return must go back to the original lot and location')
    }
    const alreadyReturned = returnedByLine.get(line.distributionLineId) ?? 0
    const remaining = asNumber(issuedLine.quantity) - alreadyReturned
    if (line.quantity > remaining) throw new HttpError(400, 'Return quantity is greater than remaining issued quantity')
    return {
      distribution_id: line.distributionId,
      distribution_line_id: line.distributionLineId,
      lot_id: line.lotId,
      location_id: line.locationId,
      quantity: line.quantity,
    }
  })

  const reference = `HPV-return-${input.returnedOn}-${asString(siteRow.code) || asString(siteRow.name)}`
  const { data: returnId, error: returnError } = await admin.rpc('return_hpv_kit_bundle', {
    p_site_id: input.siteId,
    p_returned_on: input.returnedOn,
    p_lines: rpcLines,
    p_reference_text: reference,
    p_note: clean(input.note),
    p_actor: actor.id,
  })
  fail(returnError)

  const id = asString(returnId)
  await writeAudit(actor, 'hpv.kit_return.create', 'hpv-kit-return', id, input)
  return { workspace: await getHpvWorkspace(actor), returnId: id }
}

export async function createHpvStorageBox(input: { boxCode: string }, actor: BmActor) {
  const { data, error } = await getAdminClient()
    .from('bm_hpv_storage_boxes')
    .insert({ box_code: input.boxCode.trim(), created_by: actor.id })
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

export async function scanHpvSample(input: { barcode: string; boxId: string; specimenType: HpvSpecimenType; position?: number | null }, actor: BmActor) {
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
    .insert({ barcode, box_id: input.boxId, position, specimen_type: input.specimenType, stored_by: actor.id })
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

  await writeAudit(actor, 'hpv.sample.store', 'hpv-sample', asString((data as RecordRow).id), { barcode, boxId: input.boxId, position, specimenType: input.specimenType })
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

export async function undoHpvSampleCheckout(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hpv_samples').select('id,barcode,status,box_id').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'HPV sample not found')
  if (asString(row.status) !== 'checked_out') throw new HttpError(409, 'ยกเลิก checkout ได้เฉพาะ sample ที่ checkout แล้ว')

  const boxId = nullableString(row.box_id)
  if (boxId) {
    // Sample came from a storage box — undoing checkout puts it back to stored in its original position.
    const { error } = await admin
      .from('bm_hpv_samples')
      .update({ status: 'stored', checked_out_at: null, checked_out_by: null, checkout_destination: null, checkout_note: null })
      .eq('id', id)
    fail(error)
  } else {
    // Sample was never stored in a box — the row only ever existed to record this checkout, so remove it entirely.
    const { error } = await admin.from('bm_hpv_samples').delete().eq('id', id)
    fail(error)
  }

  await writeAudit(actor, 'hpv.sample.checkout_undo', 'hpv-sample', id, { barcode: asString(row.barcode), restoredToBox: Boolean(boxId) })
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
  const [{ count: storedCount }, { data: boxData, error: boxError }] = await Promise.all([
    admin.from('bm_hpv_samples').select('*', { count: 'exact', head: true }).eq('status', 'stored'),
    admin.from('bm_hpv_storage_boxes').select('destroy_due_at,status').not('destroy_due_at', 'is', null).neq('status', 'destroyed'),
  ])
  fail(boxError)
  const states = (boxData ?? []).map((box) => getHpvDestructionState(nullableString((box as RecordRow).destroy_due_at), asString((box as RecordRow).status) as HpvBoxStatus, today))
  return { storedSamples: storedCount ?? 0, boxesDueSoon: states.filter((state) => state === 'due_soon').length, boxesDueDestruction: states.filter((state) => state === 'due_now').length }
}

export async function reopenHpvStorageBox(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { data: box, error: boxError } = await getAdminClient().from('bm_hpv_storage_boxes').select('status').eq('id', id).maybeSingle()
  fail(boxError)
  if ((box as RecordRow | null)?.status !== 'full') throw new HttpError(400, 'เปิดกลับได้เฉพาะกล่องที่ปิดแล้ว')
  const { error } = await getAdminClient()
    .from('bm_hpv_storage_boxes')
    .update({ status: 'open', filled_at: null, destroy_due_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hpv.box.reopen', 'hpv-box', id, {})
  return getHpvWorkspace(actor)
}

export async function checkoutHpvSample(input: { barcode: string; destination?: string | null; note?: string | null; specimenType?: HpvSpecimenType }, actor: BmActor) {
  const admin = getAdminClient()
  const barcode = input.barcode.trim()
  const destination = clean(input.destination) ?? 'Co-testing'
  const note = clean(input.note)
  const checkedOutAt = new Date().toISOString()

  const { data: sample, error: sampleError } = await admin.from('bm_hpv_samples').select('id,status').eq('barcode', barcode).maybeSingle()
  fail(sampleError)
  const sampleRow = sample as RecordRow | null

  if (!sampleRow) {
    // Barcode was never stored in a storage box (e.g. sample sent straight to co-testing) — record the checkout directly.
    if (!input.specimenType) throw new HttpError(400, 'กรุณาระบุประเภทตัวอย่างสำหรับ sample ที่ไม่ได้มาจาก storage box')
    const { data, error } = await admin
      .from('bm_hpv_samples')
      .insert({
        barcode,
        box_id: null,
        position: null,
        from_storage_box: false,
        specimen_type: input.specimenType,
        status: 'checked_out',
        stored_at: checkedOutAt,
        stored_by: actor.id,
        checked_out_at: checkedOutAt,
        checked_out_by: actor.id,
        checkout_destination: destination,
        checkout_note: note,
      })
      .select('id')
      .single()
    fail(error)
    await writeAudit(actor, 'hpv.sample.checkout', 'hpv-sample', asString((data as RecordRow).id), { barcode, destination, fromStorageBox: false, specimenType: input.specimenType })
    return getHpvWorkspace(actor)
  }

  if (asString(sampleRow.status) !== 'stored') throw new HttpError(409, 'Only stored HPV samples can be checked out')

  const { error } = await admin
    .from('bm_hpv_samples')
    .update({
      status: 'checked_out',
      checked_out_at: checkedOutAt,
      checked_out_by: actor.id,
      checkout_destination: destination,
      checkout_note: note,
    })
    .eq('id', asString(sampleRow.id))
  fail(error)
  await writeAudit(actor, 'hpv.sample.checkout', 'hpv-sample', asString(sampleRow.id), { barcode, destination })
  return getHpvWorkspace(actor)
}
