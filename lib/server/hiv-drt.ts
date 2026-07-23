import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { bangkokDateKey, todayBangkok } from '@/lib/bm/rules'
import {
  addBusinessDays,
  addCalendarMonths,
  getHivDrtDestructionState,
  getHivDrtTatState,
  HIV_DRT_RACK_CAPACITY,
  HIV_DRT_TAT_BUSINESS_DAYS,
  nextHivDrtRackPosition,
} from '@/lib/hiv-drt/rules'
import type { HivDrtDashboard, HivDrtRack, HivDrtSample, HivDrtWorkspace } from '@/lib/hiv-drt/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
type DbError = { message: string; code?: string } | null

function fail(error: DbError, message = 'HIV DRT database operation failed') {
  if (!error) return
  throw new HttpError(error.code === '23505' ? 409 : 400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value)
}

function assertHivDrtAccess(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'HIV DRT Staff permission required')
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function sampleFromRow(row: RecordRow, names: Map<string, string>): HivDrtSample {
  return {
    id: asString(row.id),
    barcode: asString(row.barcode),
    status: asString(row.status) as HivDrtSample['status'],
    fromStorage: Boolean(row.from_storage),
    currentRackId: nullableString(row.current_rack_id),
    currentPosition: nullableNumber(row.current_position),
    storedRackCode: nullableString(row.stored_rack_code),
    storedPosition: nullableNumber(row.stored_position),
    storedAt: nullableString(row.stored_at),
    storedByName: names.get(asString(row.stored_by)) ?? null,
    destroyDueOn: nullableString(row.destroy_due_on),
    checkedOutAt: nullableString(row.checked_out_at),
    checkedOutByName: names.get(asString(row.checked_out_by)) ?? null,
    checkoutDestination: nullableString(row.checkout_destination),
    tatDueOn: nullableString(row.tat_due_on),
    resultReceivedAt: nullableString(row.result_received_at),
    resultReceivedByName: names.get(asString(row.result_received_by)) ?? null,
    destroyedAt: nullableString(row.destroyed_at),
    destroyedByName: names.get(asString(row.destroyed_by)) ?? null,
    createdAt: asString(row.created_at),
  }
}

export async function getHivDrtWorkspace(actor: BmActor): Promise<HivDrtWorkspace> {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const [{ data: rackData, error: rackError }, { data: sampleData, error: sampleError }] = await Promise.all([
    admin.from('bm_hiv_drt_racks').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('bm_hiv_drt_samples').select('*').order('created_at', { ascending: false }).limit(5000),
  ])
  fail(rackError)
  fail(sampleError)
  const rackRows = (rackData ?? []) as RecordRow[]
  const sampleRows = (sampleData ?? []) as RecordRow[]
  const names = await getNameMap([
    ...rackRows.map((row) => asString(row.created_by)),
    ...sampleRows.flatMap((row) => [asString(row.stored_by), asString(row.checked_out_by), asString(row.result_received_by), asString(row.destroyed_by)]),
  ])
  const samples = sampleRows.map((row) => sampleFromRow(row, names))
  const samplesByRack = new Map<string, HivDrtSample[]>()
  for (const sample of samples) {
    if (sample.status === 'stored' && sample.currentRackId) {
      samplesByRack.set(sample.currentRackId, [...(samplesByRack.get(sample.currentRackId) ?? []), sample])
    }
  }
  const racks: HivDrtRack[] = rackRows.map((row) => {
    const rackId = asString(row.id)
    const rackCode = asString(row.rack_code)
    const historicalMax = samples
      .filter((sample) => sample.storedRackCode === rackCode || sample.currentRackId === rackId)
      .reduce((max, sample) => Math.max(max, sample.storedPosition ?? 0), 0)
    return {
      id: rackId,
      rackCode,
      rows: Number(row.rows),
      columns: Number(row.columns),
      capacity: Number(row.capacity),
      nextPosition: Math.min(HIV_DRT_RACK_CAPACITY + 1, Math.max(Number(row.next_position) || 1, historicalMax + 1)),
      createdAt: asString(row.created_at),
      createdByName: names.get(asString(row.created_by)) ?? null,
      samples: (samplesByRack.get(rackId) ?? []).sort((a, b) => (a.currentPosition ?? 0) - (b.currentPosition ?? 0)),
    }
  })
  return { racks, samples }
}

export async function createHivDrtRack(input: { rackCode: string }, actor: BmActor) {
  assertHivDrtAccess(actor)
  const rackCode = input.rackCode.trim()
  const { data, error } = await getAdminClient()
    .from('bm_hiv_drt_racks')
    .insert({ rack_code: rackCode, created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'hiv_drt.rack.create', 'hiv-drt-rack', id, { rackCode })
  return getHivDrtWorkspace(actor)
}

export async function deleteHivDrtRack(id: string, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const { count, error: countError } = await admin
    .from('bm_hiv_drt_samples')
    .select('id', { count: 'exact', head: true })
    .eq('current_rack_id', id)
    .eq('status', 'stored')
  fail(countError)
  if (count) throw new HttpError(409, 'ลบ Rack ไม่ได้ เนื่องจากยังมี tube อยู่ใน Rack')
  const { data, error } = await admin.from('bm_hiv_drt_racks').delete().eq('id', id).select('rack_code').maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบ Rack')
  await writeAudit(actor, 'hiv_drt.rack.delete', 'hiv-drt-rack', id, { rackCode: asString((data as RecordRow).rack_code) })
  return getHivDrtWorkspace(actor)
}

export async function storeHivDrtSample(input: { barcode: string; rackId: string; position?: number | null }, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const barcode = input.barcode.trim()
  const { data: existing, error: existingError } = await admin.from('bm_hiv_drt_samples').select('id').eq('barcode', barcode).maybeSingle()
  fail(existingError)
  if (existing) throw new HttpError(409, 'Barcode นี้มีอยู่ใน HIV DRT แล้ว')

  const { data: rack, error: rackError } = await admin.from('bm_hiv_drt_racks').select('id,rack_code,next_position').eq('id', input.rackId).maybeSingle()
  fail(rackError)
  const rackRow = rack as RecordRow | null
  if (!rackRow) throw new HttpError(404, 'ไม่พบ Rack ที่เลือก')
  const [{ data: currentPositions, error: currentPositionError }, { data: historicalPositions, error: historicalPositionError }] = await Promise.all([
    admin.from('bm_hiv_drt_samples').select('id,current_position,stored_position').eq('current_rack_id', input.rackId),
    admin.from('bm_hiv_drt_samples').select('id,current_position,stored_position').eq('stored_rack_code', asString(rackRow.rack_code)),
  ])
  fail(currentPositionError)
  fail(historicalPositionError)
  const positionRows = [...new Map(
    ([...(currentPositions ?? []), ...(historicalPositions ?? [])] as RecordRow[]).map((row) => [asString(row.id), row]),
  ).values()]
  const occupied = positionRows.map((row) => nullableNumber(row.current_position)).filter((value): value is number => value !== null)
  const historicalMax = positionRows.reduce((max, row) => Math.max(max, nullableNumber(row.stored_position) ?? 0), 0)
  const cursor = Math.min(HIV_DRT_RACK_CAPACITY + 1, Math.max(Number(rackRow.next_position ?? 1), historicalMax + 1))
  const position = input.position ?? nextHivDrtRackPosition(occupied, cursor)
  if (!position) throw new HttpError(409, 'ไม่มีช่อง Auto-fill ถัดไป กรุณาเลือกช่องว่างเอง')
  if (occupied.includes(position)) throw new HttpError(409, 'ตำแหน่งนี้มี tube อยู่แล้ว')

  const storedAt = new Date().toISOString()
  const storedOn = bangkokDateKey(storedAt)
  const destroyDueOn = addCalendarMonths(storedOn, 3)
  const { data, error } = await admin
    .from('bm_hiv_drt_samples')
    .insert({
      barcode,
      status: 'stored',
      from_storage: true,
      current_rack_id: input.rackId,
      current_position: position,
      stored_rack_code: asString(rackRow.rack_code),
      stored_position: position,
      stored_at: storedAt,
      stored_by: actor.id,
      destroy_due_on: destroyDueOn,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  if (position >= cursor) {
    const { error: cursorError } = await admin
      .from('bm_hiv_drt_racks')
      .update({ next_position: Math.min(HIV_DRT_RACK_CAPACITY + 1, position + 1), updated_at: storedAt })
      .eq('id', input.rackId)
    fail(cursorError)
  }
  await writeAudit(actor, 'hiv_drt.sample.store', 'hiv-drt-sample', id, { barcode, rackId: input.rackId, position, destroyDueOn })
  return getHivDrtWorkspace(actor)
}

export async function moveHivDrtSample(id: string, position: number, actor: BmActor) {
  assertHivDrtAccess(actor)
  const { error } = await getAdminClient().rpc('move_hiv_drt_sample_position', {
    p_sample_id: id,
    p_target_position: position,
    p_actor: actor.id,
  })
  fail(error)
  await writeAudit(actor, 'hiv_drt.sample.move', 'hiv-drt-sample', id, { position })
  return getHivDrtWorkspace(actor)
}

export async function deleteHivDrtSample(id: string, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hiv_drt_samples').select('id,barcode,status').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ tube')
  const { error } = await admin.from('bm_hiv_drt_samples').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'hiv_drt.sample.delete', 'hiv-drt-sample', id, { barcode: asString(row.barcode), status: asString(row.status) })
  return getHivDrtWorkspace(actor)
}

export async function checkoutHivDrtSample(input: { barcode: string; destination?: string | null }, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const barcode = input.barcode.trim()
  const destination = input.destination?.trim() || 'LAB Rama'
  const checkedOutAt = new Date().toISOString()
  const tatDueOn = addBusinessDays(bangkokDateKey(checkedOutAt), HIV_DRT_TAT_BUSINESS_DAYS)
  const { data: sample, error: sampleError } = await admin.from('bm_hiv_drt_samples').select('id,status').eq('barcode', barcode).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  let id: string
  let fromStorage = false
  if (!row) {
    const { data, error } = await admin
      .from('bm_hiv_drt_samples')
      .insert({
        barcode,
        status: 'checked_out',
        from_storage: false,
        checked_out_at: checkedOutAt,
        checked_out_by: actor.id,
        checkout_destination: destination,
        tat_due_on: tatDueOn,
        created_by: actor.id,
      })
      .select('id')
      .single()
    fail(error)
    id = asString((data as RecordRow).id)
  } else {
    if (asString(row.status) !== 'stored') throw new HttpError(409, 'Tube นี้ Checkout หรือปิดกระบวนการแล้ว')
    id = asString(row.id)
    fromStorage = true
    const { error } = await admin
      .from('bm_hiv_drt_samples')
      .update({
        status: 'checked_out',
        current_rack_id: null,
        current_position: null,
        checked_out_at: checkedOutAt,
        checked_out_by: actor.id,
        checkout_destination: destination,
        tat_due_on: tatDueOn,
        updated_at: checkedOutAt,
      })
      .eq('id', id)
    fail(error)
  }
  await writeAudit(actor, 'hiv_drt.sample.checkout', 'hiv-drt-sample', id, { barcode, destination, fromStorage, tatDueOn })
  return getHivDrtWorkspace(actor)
}

export async function receiveHivDrtResult(id: string, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hiv_drt_samples').select('id,barcode,status').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ tube')
  if (asString(row.status) !== 'checked_out') throw new HttpError(409, 'รับผลได้เฉพาะรายการที่กำลังรอผล')
  const receivedAt = new Date().toISOString()
  const { error } = await admin
    .from('bm_hiv_drt_samples')
    .update({ status: 'result_received', result_received_at: receivedAt, result_received_by: actor.id, updated_at: receivedAt })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hiv_drt.result.receive', 'hiv-drt-sample', id, { barcode: asString(row.barcode) })
  return getHivDrtWorkspace(actor)
}

export async function undoHivDrtResult(id: string, reason: string, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hiv_drt_samples').select('id,barcode,status').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ tube')
  if (asString(row.status) !== 'result_received') throw new HttpError(409, 'ย้อนสถานะได้เฉพาะรายการที่รับผลแล้ว')
  const { error } = await admin
    .from('bm_hiv_drt_samples')
    .update({ status: 'checked_out', result_received_at: null, result_received_by: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hiv_drt.result.undo', 'hiv-drt-sample', id, { barcode: asString(row.barcode), reason: reason.trim() })
  return getHivDrtWorkspace(actor)
}

export async function destroyHivDrtSample(id: string, actor: BmActor) {
  assertHivDrtAccess(actor)
  const admin = getAdminClient()
  const { data: sample, error: sampleError } = await admin.from('bm_hiv_drt_samples').select('id,barcode,status').eq('id', id).maybeSingle()
  fail(sampleError)
  const row = sample as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ tube')
  if (asString(row.status) !== 'stored') throw new HttpError(409, 'ทำลายได้เฉพาะ tube ที่ยังอยู่ใน Storage')
  const destroyedAt = new Date().toISOString()
  const { error } = await admin
    .from('bm_hiv_drt_samples')
    .update({
      status: 'destroyed',
      current_rack_id: null,
      current_position: null,
      destroyed_at: destroyedAt,
      destroyed_by: actor.id,
      updated_at: destroyedAt,
    })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'hiv_drt.sample.destroy', 'hiv-drt-sample', id, { barcode: asString(row.barcode) })
  return getHivDrtWorkspace(actor)
}

export async function getHivDrtDashboardData(): Promise<HivDrtDashboard> {
  const { data, error } = await getAdminClient()
    .from('bm_hiv_drt_samples')
    .select('status,checked_out_at,destroy_due_on')
    .in('status', ['stored', 'checked_out'])
    .limit(10000)
  fail(error)
  const today = todayBangkok()
  const rows = (data ?? []) as RecordRow[]
  const stored = rows.filter((row) => asString(row.status) === 'stored')
  const waiting = rows.filter((row) => asString(row.status) === 'checked_out')
  return {
    storedSamples: stored.length,
    awaitingResults: waiting.length,
    overdueResults: waiting.filter((row) => getHivDrtTatState(nullableString(row.checked_out_at), 'checked_out', today) === 'overdue').length,
    destructionDueSoon: stored.filter((row) => getHivDrtDestructionState(nullableString(row.destroy_due_on), 'stored', today) === 'due_soon').length,
    destructionDueNow: stored.filter((row) => getHivDrtDestructionState(nullableString(row.destroy_due_on), 'stored', today) === 'due_now').length,
  }
}
