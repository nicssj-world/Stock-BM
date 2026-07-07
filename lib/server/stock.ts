import 'server-only'

import { getExpiryState, sortLotsFefo } from '@/lib/bm/rules'
import type {
  BmActor,
  LotIssueContext,
  QuickIssueResult,
  ScanResolution,
  StockBalance,
  StockCategory,
  StockItem,
  StockLocation,
  StockLot,
  StockTransaction,
  StockTransactionLine,
  StockWorkspace,
} from '@/lib/bm/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'BM stock database operation failed') {
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

function number(value: unknown) {
  return Number(value ?? 0)
}

function ids(rows: RecordRow[], key: string) {
  return [...new Set(rows.map((row) => asString(row[key])).filter(Boolean))]
}

async function getNameMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', userIds)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function balanceKey(lotId: string, locationId: string) {
  return `${lotId}:${locationId}`
}

export async function getStockWorkspace(actor: BmActor): Promise<StockWorkspace> {
  const admin = getAdminClient()
  const [
    { data: categoryData, error: categoryError },
    { data: locationData, error: locationError },
    { data: itemData, error: itemError },
    { data: lotData, error: lotError },
    { data: transactionData, error: transactionError },
    { data: lineData, error: lineError },
  ] = await Promise.all([
    admin.from('bm_stock_categories').select('*').order('name'),
    admin.from('bm_stock_locations').select('*').order('code'),
    admin.from('bm_stock_items').select('*').order('item_code'),
    admin.from('bm_stock_lots').select('*').order('created_at'),
    admin.from('bm_stock_transactions').select('*').order('created_at', { ascending: false }).limit(500),
    admin.from('bm_stock_movement_lines').select('*').order('created_at', { ascending: false }).limit(2000),
  ])
  fail(categoryError)
  fail(locationError)
  fail(itemError)
  fail(lotError)
  fail(transactionError)
  fail(lineError)

  const categoryRows = (categoryData ?? []) as RecordRow[]
  const locationRows = (locationData ?? []) as RecordRow[]
  const itemRows = (itemData ?? []) as RecordRow[]
  const lotRows = (lotData ?? []) as RecordRow[]
  const transactionRows = (transactionData ?? []) as RecordRow[]
  const lineRows = (lineData ?? []) as RecordRow[]
  const nameMap = await getNameMap(ids(transactionRows, 'created_by'))

  const categories: StockCategory[] = categoryRows.map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
    isActive: Boolean(row.is_active),
  }))
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))

  const locations: StockLocation[] = locationRows.map((row) => ({
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    storageCondition: nullableString(row.storage_condition),
    isActive: Boolean(row.is_active),
  }))
  const locationMap = new Map(locations.map((location) => [location.id, location]))

  const lineBalance = new Map<string, number>()
  for (const line of lineRows) {
    const lotId = asString(line.lot_id)
    const locationId = asString(line.location_id)
    const key = balanceKey(lotId, locationId)
    lineBalance.set(key, (lineBalance.get(key) ?? 0) + number(line.quantity))
  }

  const itemRawMap = new Map(itemRows.map((row) => [asString(row.id), row]))
  const lotsByItem = new Map<string, StockLot[]>()
  const lotMap = new Map<string, StockLot>()
  for (const lotRow of lotRows) {
    const itemId = asString(lotRow.item_id)
    const itemRow = itemRawMap.get(itemId)
    const warningDays = Number(itemRow?.expiry_warning_days ?? 90)
    const balances: StockBalance[] = []
    for (const [key, onHand] of lineBalance) {
      const [lotId, locationId] = key.split(':')
      if (lotId !== asString(lotRow.id) || onHand === 0) continue
      const location = locationMap.get(locationId)
      if (!location) continue
      balances.push({
        lotId,
        locationId,
        locationCode: location.code,
        locationName: location.name,
        onHand,
      })
    }
    const totalOnHand = balances.reduce((sum, balance) => sum + balance.onHand, 0)
    const expiryDate = nullableString(lotRow.expiry_date)
    const expiryState = getExpiryState(expiryDate, warningDays)
    const lot: StockLot = {
      id: asString(lotRow.id),
      itemId,
      lotNumber: asString(lotRow.lot_number),
      expiryDate,
      expiryState,
      internalQrToken: asString(lotRow.internal_qr_token),
      manufacturerBarcode: nullableString(lotRow.manufacturer_barcode),
      createdAt: asString(lotRow.created_at),
      totalOnHand,
      usableOnHand: expiryState === 'expired' ? 0 : totalOnHand,
      balances: balances.sort((a, b) => a.locationCode.localeCompare(b.locationCode)),
    }
    lotMap.set(lot.id, lot)
    lotsByItem.set(itemId, [...(lotsByItem.get(itemId) ?? []), lot])
  }

  const items: StockItem[] = itemRows.map((row) => {
    const lots = sortLotsFefo(lotsByItem.get(asString(row.id)) ?? [])
    const totalOnHand = lots.reduce((sum, lot) => sum + lot.totalOnHand, 0)
    const usableOnHand = lots.reduce((sum, lot) => sum + lot.usableOnHand, 0)
    const minimumStock = number(row.minimum_stock)
    return {
      id: asString(row.id),
      itemCode: asString(row.item_code),
      name: asString(row.name),
      categoryId: asString(row.category_id),
      categoryName: categoryMap.get(asString(row.category_id)) ?? '-',
      unit: asString(row.unit),
      minimumStock,
      expiryWarningDays: Number(row.expiry_warning_days ?? 90),
      defaultIssueQty: row.default_issue_qty == null ? null : number(row.default_issue_qty),
      storageCondition: nullableString(row.storage_condition),
      supplier: nullableString(row.supplier),
      catalogNo: nullableString(row.catalog_no),
      manufacturer: nullableString(row.manufacturer),
      manufacturerBarcode: nullableString(row.manufacturer_barcode),
      trackLot: Boolean(row.track_lot),
      trackExpiry: Boolean(row.track_expiry),
      isHpv: Boolean(row.is_hpv),
      isActive: Boolean(row.is_active),
      totalOnHand,
      usableOnHand,
      isLowStock: Boolean(row.is_active) && usableOnHand <= minimumStock,
      lots,
    }
  })
  const itemMap = new Map(items.map((item) => [item.id, item]))
  const reversedByMap = new Map(
    transactionRows
      .filter((row) => nullableString(row.source_transaction_id))
      .map((row) => [asString(row.source_transaction_id), asString(row.id)]),
  )
  const linesByTransaction = new Map<string, StockTransactionLine[]>()
  for (const row of lineRows) {
    const lot = lotMap.get(asString(row.lot_id))
    const item = itemMap.get(lot?.itemId ?? '')
    const location = locationMap.get(asString(row.location_id))
    const transactionId = asString(row.transaction_id)
    if (!lot || !item || !location) continue
    const line: StockTransactionLine = {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      unit: item.unit,
      locationId: location.id,
      locationCode: location.code,
      locationName: location.name,
      quantity: number(row.quantity),
    }
    linesByTransaction.set(transactionId, [...(linesByTransaction.get(transactionId) ?? []), line])
  }

  const transactions: StockTransaction[] = transactionRows.map((row) => {
    const id = asString(row.id)
    const reversedByTransactionId = reversedByMap.get(id) ?? null
    const createdBy = asString(row.created_by)
    return {
      id,
      transactionType: asString(row.transaction_type) as StockTransaction['transactionType'],
      reference: nullableString(row.reference_text),
      purpose: nullableString(row.purpose_text),
      note: nullableString(row.note),
      overrideReason: nullableString(row.override_reason),
      sourceTransactionId: nullableString(row.source_transaction_id),
      reversedByTransactionId,
      createdBy,
      createdByName: nameMap.get(createdBy) ?? null,
      createdAt: asString(row.created_at),
      canReverse: actor.role === 'Admin' && !reversedByTransactionId && !nullableString(row.source_transaction_id),
      lines: linesByTransaction.get(id) ?? [],
    }
  })

  const activeItems = items.filter((item) => item.isActive)
  const stockedLots = items.flatMap((item) => item.lots).filter((lot) => lot.totalOnHand > 0)
  return {
    categories,
    locations,
    items,
    transactions,
    activeItemCount: activeItems.length,
    lowStockItemCount: activeItems.filter((item) => item.isLowStock).length,
    expiringLotCount: stockedLots.filter((lot) => lot.expiryState === 'expiring').length,
    expiredLotCount: stockedLots.filter((lot) => lot.expiryState === 'expired').length,
    locationCount: locations.filter((location) => location.isActive).length,
  }
}

async function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
}

async function assertActiveCategory(categoryId: string) {
  const { data, error } = await getAdminClient().from('bm_stock_categories').select('id').eq('id', categoryId).eq('is_active', true).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(400, 'Active BM stock category not found')
}

function assertTracking(trackLot: boolean, trackExpiry: boolean) {
  if (trackExpiry && !trackLot) throw new HttpError(400, 'Expiry tracking requires lot tracking')
}

export async function createCategory(name: string, actor: BmActor) {
  await assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_stock_categories')
    .insert({ name: name.trim(), created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'category.create', 'stock-category', asString((data as RecordRow).id), { name: name.trim() })
  return getStockWorkspace(actor)
}

export async function updateCategory(id: string, input: { name?: string; isActive?: boolean }, actor: BmActor) {
  await assertAdmin(actor)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { error } = await getAdminClient().from('bm_stock_categories').update(updates).eq('id', id)
  fail(error)
  await writeAudit(actor, 'category.update', 'stock-category', id, input)
  return getStockWorkspace(actor)
}

export async function deleteCategory(id: string, actor: BmActor) {
  await assertAdmin(actor)
  const { error } = await getAdminClient().from('bm_stock_categories').delete().eq('id', id)
  if (error?.code === '23503') throw new HttpError(409, 'ลบ category ไม่ได้ มี item ที่ใช้ category นี้อยู่')
  fail(error)
  await writeAudit(actor, 'category.delete', 'stock-category', id, {})
  return getStockWorkspace(actor)
}

export async function createLocation(input: { code: string; name: string; storageCondition?: string | null }, actor: BmActor) {
  await assertAdmin(actor)
  const { data, error } = await getAdminClient()
    .from('bm_stock_locations')
    .insert({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      storage_condition: clean(input.storageCondition),
      created_by: actor.id,
    })
    .select('id')
    .single()
  if (error?.code === '23505') throw new HttpError(409, `Location code "${input.code.trim().toUpperCase()}" มีอยู่แล้ว`)
  fail(error)
  await writeAudit(actor, 'location.create', 'stock-location', asString((data as RecordRow).id), input)
  return getStockWorkspace(actor)
}

export async function updateLocation(id: string, input: { code?: string; name?: string; storageCondition?: string | null; isActive?: boolean }, actor: BmActor) {
  await assertAdmin(actor)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.code !== undefined) updates.code = input.code.trim().toUpperCase()
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.storageCondition !== undefined) updates.storage_condition = clean(input.storageCondition)
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { error } = await getAdminClient().from('bm_stock_locations').update(updates).eq('id', id)
  if (error?.code === '23505') throw new HttpError(409, `Location code "${(input.code ?? '').trim().toUpperCase()}" มีอยู่แล้ว`)
  fail(error)
  await writeAudit(actor, 'location.update', 'stock-location', id, input)
  return getStockWorkspace(actor)
}

export async function deleteLocation(id: string, actor: BmActor) {
  await assertAdmin(actor)
  const { error } = await getAdminClient().from('bm_stock_locations').delete().eq('id', id)
  if (error?.code === '23503') throw new HttpError(409, 'ลบ location ไม่ได้ มี stock transaction ที่อ้างถึง location นี้อยู่')
  fail(error)
  await writeAudit(actor, 'location.delete', 'stock-location', id, {})
  return getStockWorkspace(actor)
}

export async function createItem(input: {
  itemCode: string
  name: string
  categoryId: string
  unit: string
  minimumStock: number
  expiryWarningDays: number
  defaultIssueQty?: number | null
  storageCondition?: string | null
  supplier?: string | null
  catalogNo?: string | null
  manufacturer?: string | null
  manufacturerBarcode?: string | null
  trackLot: boolean
  trackExpiry: boolean
  isHpv?: boolean
}, actor: BmActor) {
  await assertAdmin(actor)
  assertTracking(input.trackLot, input.trackExpiry)
  await assertActiveCategory(input.categoryId)
  const { data, error } = await getAdminClient()
    .from('bm_stock_items')
    .insert({
      item_code: input.itemCode.trim(),
      name: input.name.trim(),
      category_id: input.categoryId,
      unit: input.unit.trim(),
      minimum_stock: input.minimumStock,
      expiry_warning_days: input.expiryWarningDays,
      default_issue_qty: input.defaultIssueQty ?? null,
      storage_condition: clean(input.storageCondition),
      supplier: clean(input.supplier),
      catalog_no: clean(input.catalogNo),
      manufacturer: clean(input.manufacturer),
      manufacturer_barcode: clean(input.manufacturerBarcode),
      track_lot: input.trackLot,
      track_expiry: input.trackExpiry,
      is_hpv: input.isHpv ?? false,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  await writeAudit(actor, 'item.create', 'stock-item', asString((data as RecordRow).id), input)
  return getStockWorkspace(actor)
}

export async function updateItem(itemId: string, input: Partial<Parameters<typeof createItem>[0]> & { isActive?: boolean }, actor: BmActor) {
  await assertAdmin(actor)
  const { data: current, error: currentError } = await getAdminClient().from('bm_stock_items').select('*').eq('id', itemId).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'BM stock item not found')
  const currentRow = current as RecordRow
  const trackLot = input.trackLot ?? Boolean(currentRow.track_lot)
  const trackExpiry = input.trackExpiry ?? Boolean(currentRow.track_expiry)
  assertTracking(trackLot, trackExpiry)
  if (input.categoryId) await assertActiveCategory(input.categoryId)
  if (trackLot !== Boolean(currentRow.track_lot) || trackExpiry !== Boolean(currentRow.track_expiry)) {
    const { count, error } = await getAdminClient()
      .from('bm_stock_movement_lines')
      .select('id,bm_stock_lots!inner(item_id)', { count: 'exact', head: true })
      .eq('bm_stock_lots.item_id', itemId)
    fail(error)
    if (count) throw new HttpError(409, 'Cannot change lot tracking after stock movements exist')
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.itemCode !== undefined) updates.item_code = input.itemCode.trim()
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.categoryId !== undefined) updates.category_id = input.categoryId
  if (input.unit !== undefined) updates.unit = input.unit.trim()
  if (input.minimumStock !== undefined) updates.minimum_stock = input.minimumStock
  if (input.expiryWarningDays !== undefined) updates.expiry_warning_days = input.expiryWarningDays
  if (input.defaultIssueQty !== undefined) updates.default_issue_qty = input.defaultIssueQty
  if (input.storageCondition !== undefined) updates.storage_condition = clean(input.storageCondition)
  if (input.supplier !== undefined) updates.supplier = clean(input.supplier)
  if (input.catalogNo !== undefined) updates.catalog_no = clean(input.catalogNo)
  if (input.manufacturer !== undefined) updates.manufacturer = clean(input.manufacturer)
  if (input.manufacturerBarcode !== undefined) updates.manufacturer_barcode = clean(input.manufacturerBarcode)
  if (input.trackLot !== undefined) updates.track_lot = input.trackLot
  if (input.trackExpiry !== undefined) updates.track_expiry = input.trackExpiry
  if (input.isHpv !== undefined) updates.is_hpv = input.isHpv
  if (input.isActive !== undefined) updates.is_active = input.isActive
  const { error } = await getAdminClient().from('bm_stock_items').update(updates).eq('id', itemId)
  fail(error)
  await writeAudit(actor, 'item.update', 'stock-item', itemId, input)
  return getStockWorkspace(actor)
}

export async function deleteItem(id: string, actor: BmActor) {
  await assertAdmin(actor)
  const { error } = await getAdminClient().from('bm_stock_items').delete().eq('id', id)
  if (error?.code === '23503') throw new HttpError(409, 'ลบ item ไม่ได้ มี lot หรือ transaction ที่อ้างถึง item นี้อยู่')
  fail(error)
  await writeAudit(actor, 'item.delete', 'stock-item', id, {})
  return getStockWorkspace(actor)
}

export async function receiveStock(input: {
  itemId: string
  lotNumber?: string | null
  expiryDate?: string | null
  quantity: number
  locationId: string
  supplier?: string | null
  reference?: string | null
  note?: string | null
  manufacturerBarcode?: string | null
}, actor: BmActor) {
  const { data, error } = await getAdminClient().rpc('receive_bm_stock', {
    p_item: input.itemId,
    p_lot_number: clean(input.lotNumber),
    p_expiry_date: input.expiryDate || null,
    p_quantity: input.quantity,
    p_location: input.locationId,
    p_supplier_text: clean(input.supplier),
    p_reference_text: clean(input.reference),
    p_note: clean(input.note),
    p_manufacturer_barcode: clean(input.manufacturerBarcode),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.receive', 'stock-transaction', asString(data), input)
  return getStockWorkspace(actor)
}

export async function issueStock(input: {
  lotId: string
  locationId: string
  quantity: number
  purpose?: string | null
  reference?: string | null
  note?: string | null
  overrideReason?: string | null
  expiredConfirmed: boolean
}, actor: BmActor) {
  const { data, error } = await getAdminClient().rpc('issue_bm_stock', {
    p_lot: input.lotId,
    p_location: input.locationId,
    p_quantity: input.quantity,
    p_purpose_text: clean(input.purpose),
    p_reference_text: clean(input.reference),
    p_note: clean(input.note),
    p_override_reason: clean(input.overrideReason),
    p_expired_confirmed: input.expiredConfirmed,
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.issue', 'stock-transaction', asString(data), input)
  return getStockWorkspace(actor)
}

export async function moveStock(input: {
  lotId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
  reference?: string | null
  note?: string | null
}, actor: BmActor) {
  const { data, error } = await getAdminClient().rpc('move_bm_stock', {
    p_lot: input.lotId,
    p_from_location: input.fromLocationId,
    p_to_location: input.toLocationId,
    p_quantity: input.quantity,
    p_reference_text: clean(input.reference),
    p_note: clean(input.note),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.move', 'stock-transaction', asString(data), input)
  return getStockWorkspace(actor)
}

export async function adjustStock(input: { lotId: string; locationId: string; quantity: number; reference?: string | null; note: string }, actor: BmActor) {
  const { data, error } = await getAdminClient().rpc('adjust_bm_stock', {
    p_lot: input.lotId,
    p_location: input.locationId,
    p_quantity: input.quantity,
    p_reference_text: clean(input.reference),
    p_note: input.note.trim(),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.adjust', 'stock-transaction', asString(data), input)
  return getStockWorkspace(actor)
}

export async function reverseStockTransaction(transactionId: string, reason: string, actor: BmActor) {
  const { data, error } = await getAdminClient().rpc('reverse_bm_stock_transaction', {
    p_transaction: transactionId,
    p_reason: reason.trim(),
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'stock.reverse', 'stock-transaction', asString(data), { sourceTransactionId: transactionId, reason: reason.trim() })
  return getStockWorkspace(actor)
}

export async function resolveScan(codeInput: string): Promise<ScanResolution> {
  const code = codeInput.trim()
  if (!code) return { kind: 'unknown', code }
  const token = extractLotToken(code)
  const locationToken = extractLocationToken(code)
  const admin = getAdminClient()

  if (locationToken) {
    const { data, error } = await admin.from('bm_stock_locations').select('*').eq('id', locationToken).maybeSingle()
    fail(error)
    if (data) {
      const row = data as RecordRow
      return {
        kind: 'location',
        code,
        locationId: asString(row.id),
        locationCode: asString(row.code),
        locationName: asString(row.name),
        href: `/inventory?locationId=${encodeURIComponent(asString(row.id))}`,
      }
    }
  }

  if (token) {
    const { data, error } = await admin.from('bm_stock_lots').select('*').eq('internal_qr_token', token).maybeSingle()
    fail(error)
    if (data) return lotResolution(data as RecordRow, code, 'internal-lot')
  }

  const { data: lot, error: lotError } = await admin.from('bm_stock_lots').select('*').eq('manufacturer_barcode', code).maybeSingle()
  fail(lotError)
  if (lot) return lotResolution(lot as RecordRow, code, 'manufacturer-barcode')

  const { data: item, error: itemError } = await admin.from('bm_stock_items').select('*').eq('manufacturer_barcode', code).maybeSingle()
  fail(itemError)
  if (item) {
    const itemRow = item as RecordRow
    return {
      kind: 'manufacturer-barcode',
      code,
      itemId: asString(itemRow.id),
      itemCode: asString(itemRow.item_code),
      itemName: asString(itemRow.name),
      href: `/movements?mode=receive&itemId=${encodeURIComponent(asString(itemRow.id))}`,
    }
  }

  return { kind: 'unknown', code }
}

export function extractLotToken(value: string) {
  const match = value.match(/\/(?:scan\/lot|issue)\/([A-Za-z0-9_-]+)/)
  if (match) return match[1]
  if (/^[A-Za-z0-9_-]{18,80}$/.test(value)) return value
  return null
}

export function extractLocationToken(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/\/scan\/location\/([0-9a-fA-F-]{36})/)
  if (match) return match[1]
  const raw = trimmed.match(/^BMLOC:([0-9a-fA-F-]{36})$/i)
  if (raw) return raw[1]
  return null
}

async function lotResolution(lotRow: RecordRow, code: string, kind: ScanResolution['kind']): Promise<ScanResolution> {
  const admin = getAdminClient()
  const { data: item, error: itemError } = await admin.from('bm_stock_items').select('*').eq('id', asString(lotRow.item_id)).maybeSingle()
  fail(itemError)
  const { data: lines, error: lineError } = await admin.from('bm_stock_movement_lines').select('location_id,quantity').eq('lot_id', asString(lotRow.id))
  fail(lineError)
  const balances = new Map<string, number>()
  ;((lines ?? []) as RecordRow[]).forEach((line) => balances.set(asString(line.location_id), (balances.get(asString(line.location_id)) ?? 0) + number(line.quantity)))
  const locationId = [...balances.entries()].filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1])[0]?.[0]
  let locationCode: string | undefined
  if (locationId) {
    const { data: location, error: locationError } = await admin.from('bm_stock_locations').select('code').eq('id', locationId).maybeSingle()
    fail(locationError)
    locationCode = asString((location as RecordRow | null)?.code)
  }
  const itemRow = (item ?? {}) as RecordRow
  return {
    kind,
    code,
    itemId: asString(itemRow.id),
    itemCode: asString(itemRow.item_code),
    itemName: asString(itemRow.name),
    lotId: asString(lotRow.id),
    lotToken: asString(lotRow.internal_qr_token),
    lotNumber: asString(lotRow.lot_number),
    locationId,
    locationCode,
    href: `/scan/lot/${encodeURIComponent(asString(lotRow.internal_qr_token))}`,
  }
}

// Context for the quick-issue screen reached by scanning a lot QR sticker.
// Reuses getStockWorkspace so balances/expiry/FEFO are computed consistently.
export async function resolveLotForIssue(token: string, actor: BmActor): Promise<LotIssueContext> {
  const trimmed = token.trim()
  if (!trimmed) throw new HttpError(404, 'Lot not found')
  const workspace = await getStockWorkspace(actor)
  const item = workspace.items.find((candidate) => candidate.lots.some((lot) => lot.internalQrToken === trimmed))
  const lot = item?.lots.find((candidate) => candidate.internalQrToken === trimmed)
  if (!item || !lot) throw new HttpError(404, 'Lot not found for this QR')
  const balances = lot.balances.filter((balance) => balance.onHand > 0)
  const suggestedLocationId = [...balances].sort((a, b) => b.onHand - a.onHand)[0]?.locationId ?? null
  return {
    lotId: lot.id,
    lotToken: lot.internalQrToken,
    lotNumber: lot.lotNumber,
    itemId: item.id,
    itemCode: item.itemCode,
    itemName: item.name,
    unit: item.unit,
    expiryDate: lot.expiryDate,
    expiryState: lot.expiryState,
    defaultIssueQty: item.defaultIssueQty,
    balances,
    suggestedLocationId,
  }
}

// Resolve a scanned code (URL or raw token) to issue context for batch scanning.
export async function resolveIssueContext(code: string, actor: BmActor): Promise<LotIssueContext> {
  const token = extractLotToken(code)
  if (!token) throw new HttpError(404, 'Not a lot QR')
  return resolveLotForIssue(token, actor)
}

export async function quickIssueByCode(code: string, actor: BmActor): Promise<{ stock: StockWorkspace; result: QuickIssueResult }> {
  const context = await resolveIssueContext(code, actor)
  const balance = context.balances.find((item) => item.locationId === context.suggestedLocationId) ?? context.balances[0]
  if (!balance) throw new HttpError(400, 'Lot นี้ไม่มีของคงเหลือ')
  if (context.expiryState === 'expired') throw new HttpError(400, `Lot ${context.lotNumber} หมดอายุแล้ว ต้องตัดผ่านหน้า manual issue`)

  const quantity = context.defaultIssueQty ?? 1
  if (!(quantity > 0)) throw new HttpError(400, 'Default issue quantity ไม่ถูกต้อง')
  if (quantity > balance.onHand) throw new HttpError(400, `ของคงเหลือไม่พอ (${balance.onHand} ${context.unit})`)

  const stock = await issueStock({
    lotId: context.lotId,
    locationId: balance.locationId,
    quantity,
    purpose: 'QR scan issue',
    reference: 'auto-scan',
    note: null,
    overrideReason: null,
    expiredConfirmed: false,
  }, actor)

  return {
    stock,
    result: {
      itemCode: context.itemCode,
      itemName: context.itemName,
      lotNumber: context.lotNumber,
      locationCode: balance.locationCode,
      quantity,
      unit: context.unit,
    },
  }
}

// Batch issue: one ledger transaction per line (the issue RPC is per-lot). Lines are
// independent — a failure on one does not roll back others; results report per line.
export async function issueBatch(input: {
  lines: { lotId: string; locationId: string; quantity: number; expiredConfirmed?: boolean; overrideReason?: string | null }[]
  purpose?: string | null
  reference?: string | null
  note?: string | null
}, actor: BmActor): Promise<{ stock: StockWorkspace; results: { lotId: string; ok: boolean; error?: string }[] }> {
  if (!input.lines.length) throw new HttpError(400, 'No lines to issue')
  const admin = getAdminClient()
  const results: { lotId: string; ok: boolean; error?: string }[] = []
  for (const line of input.lines) {
    try {
      const { data, error } = await admin.rpc('issue_bm_stock', {
        p_lot: line.lotId,
        p_location: line.locationId,
        p_quantity: line.quantity,
        p_purpose_text: clean(input.purpose),
        p_reference_text: clean(input.reference),
        p_note: clean(input.note),
        p_override_reason: clean(line.overrideReason),
        p_expired_confirmed: line.expiredConfirmed ?? false,
        p_actor: actor.id,
      })
      if (error) throw new Error(error.message)
      await writeAudit(actor, 'stock.issue', 'stock-transaction', asString(data), { ...line, purpose: clean(input.purpose), batch: true })
      results.push({ lotId: line.lotId, ok: true })
    } catch (lineError) {
      results.push({ lotId: line.lotId, ok: false, error: lineError instanceof Error ? lineError.message : 'failed' })
    }
  }
  return { stock: await getStockWorkspace(actor), results }
}

