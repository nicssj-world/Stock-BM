import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { bangkokDateKey } from '@/lib/bm/rules'
import { isValidHivDrtPosition, nextHivDrtRackPosition, HIV_DRT_RACK_CAPACITY } from '@/lib/hiv-drt/rules'
import type { HivLabAlert, HivLabAlertLineStatus, HivLabAlertRack, HivLabAlertWorkspace } from '@/lib/hiv-lab-alert/types'
import { buildHivLabAlertMessage, maskPatientName } from '@/lib/hiv-lab-alert/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
type DbError = { message: string; code?: string } | null

function fail(error: DbError, message = 'HIV LAB Alert database operation failed') {
  if (!error) return
  if (error.code === '23505') throw new HttpError(409, 'LN นี้มีอยู่แล้วใน HIV DRT หรือ HIV LAB Alert')
  if (error.code === 'PGRST202') throw new HttpError(500, 'ยังไม่ได้ติดตั้งฐานข้อมูล HIV LAB Alert')
  const dbMessage = error.message.toLowerCase()
  if (dbMessage.includes('requested hiv drt position must be between')) {
    throw new HttpError(400, 'ตำแหน่งที่เลือกไม่ถูกต้อง')
  }
  if (dbMessage.includes('requested hiv drt position is already occupied')) {
    throw new HttpError(409, 'ตำแหน่งที่เลือกมี tube อยู่แล้ว กรุณาเลือกช่องอื่น')
  }
  if (dbMessage.includes('no auto-fill position is available in the selected hiv drt rack')) {
    throw new HttpError(409, 'Rack นี้เต็มแล้ว กรุณาเลือก Rack อื่น')
  }
  throw new HttpError(400, message)
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

function asLineStatus(value: unknown): HivLabAlertLineStatus {
  return value === 'sent' || value === 'sending' ? value : 'pending'
}

function assertHivLabAlertAccess(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'HIV LAB Alert Staff permission required')
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function rowToAlert(
  row: RecordRow,
  names: Map<string, string>,
  samples: Map<string, RecordRow>,
): HivLabAlert {
  const sample = samples.get(asString(row.hiv_drt_sample_id))
  return {
    id: asString(row.id),
    hn: asString(row.hn),
    ln: asString(row.ln),
    patientNameMasked: asString(row.patient_name_masked),
    hivDrtSampleId: asString(row.hiv_drt_sample_id),
    lineStatus: row.line_sent_at ? 'sent' : asLineStatus(row.line_status),
    lineSentAt: nullableString(row.line_sent_at),
    lineSentByName: names.get(asString(row.line_sent_by)) ?? null,
    lineSendAttempts: Number(row.line_send_attempts ?? 0),
    createdAt: asString(row.created_at),
    createdByName: names.get(asString(row.created_by)) ?? null,
    updatedAt: asString(row.updated_at),
    storageStatus: asString(sample?.status),
    storageRackId: nullableString(sample?.current_rack_id),
    storageRackCode: nullableString(sample?.stored_rack_code),
    storagePosition: nullableNumber(sample?.current_position ?? sample?.stored_position),
  }
}

export async function getHivLabAlertWorkspace(actor: BmActor): Promise<HivLabAlertWorkspace> {
  assertHivLabAlertAccess(actor)
  const admin = getAdminClient()
  const [{ data: alertData, error: alertError }, { data: rackData, error: rackError }, { data: sampleData, error: sampleError }] = await Promise.all([
    admin
      .from('bm_hiv_lab_alerts')
      .select('id,hn,ln,patient_name_masked,hiv_drt_sample_id,line_status,line_sent_at,line_sent_by,line_send_attempts,created_by,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('bm_hiv_drt_racks').select('id,rack_code,capacity,next_position').order('created_at', { ascending: false }).limit(200),
    admin.from('bm_hiv_drt_samples').select('id,status,current_rack_id,current_position,stored_rack_code,stored_position').limit(5000),
  ])
  fail(alertError)
  fail(rackError)
  fail(sampleError)

  const alertRows = (alertData ?? []) as RecordRow[]
  const rackRows = (rackData ?? []) as RecordRow[]
  const sampleRows = (sampleData ?? []) as RecordRow[]
  const sampleMap = new Map(sampleRows.map((row) => [asString(row.id), row]))
  const names = await getNameMap([
    ...alertRows.map((row) => asString(row.created_by)),
    ...alertRows.map((row) => asString(row.line_sent_by)),
  ])

  const racks: HivLabAlertRack[] = rackRows.map((row) => {
    const rackId = asString(row.id)
    const rackCode = asString(row.rack_code)
    const historicalMax = sampleRows
      .filter((sample) => asString(sample.stored_rack_code) === rackCode || asString(sample.current_rack_id) === rackId)
      .reduce((max, sample) => Math.max(max, nullableNumber(sample.stored_position) ?? 0), 0)
    const nextPosition = Math.min(
      HIV_DRT_RACK_CAPACITY + 1,
      Math.max(Number(row.next_position) || 1, historicalMax + 1),
    )
    const occupied = sampleRows
      .filter((sample) => asString(sample.current_rack_id) === rackId && asString(sample.status) === 'stored')
      .map((sample) => nullableNumber(sample.current_position))
      .filter((position): position is number => position !== null && isValidHivDrtPosition(position))
      .sort((left, right) => left - right)
    return {
      id: rackId,
      rackCode,
      capacity: Number(row.capacity) || HIV_DRT_RACK_CAPACITY,
      nextPosition,
      nextAutoPosition: nextHivDrtRackPosition(occupied, nextPosition),
      occupiedPositions: occupied,
    }
  })

  return {
    alerts: alertRows.map((row) => rowToAlert(row, names, sampleMap)),
    racks,
  }
}

function rpcRow(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? row as RecordRow : null
}

export async function createHivLabAlert(
  input: { hn: string; ln: string; patientName: string; rackId: string; position?: number | null },
  actor: BmActor,
) {
  assertHivLabAlertAccess(actor)
  const hn = input.hn.trim()
  const ln = input.ln.trim()
  const position = input.position ?? null
  if (position !== null && !isValidHivDrtPosition(position)) {
    throw new HttpError(400, 'ตำแหน่งที่เลือกไม่ถูกต้อง')
  }
  const patientNameMasked = maskPatientName(input.patientName)
  if (!patientNameMasked) throw new HttpError(400, 'กรุณาระบุชื่อ-นามสกุล')

  const { data, error } = await getAdminClient().rpc('create_hiv_lab_alert', {
    p_hn: hn,
    p_ln: ln,
    p_patient_name_masked: patientNameMasked,
    p_rack_id: input.rackId,
    p_actor: actor.id,
    p_position: position,
  })
  fail(error)
  const created = rpcRow(data)
  if (!created) throw new HttpError(500, 'ไม่สามารถสร้าง HIV LAB Alert ได้')
  const alertId = asString(created.alert_id)
  await writeAudit(actor, 'hiv_lab_alert.create', 'hiv-lab-alert', alertId, {
    hn,
    ln,
    patientNameMasked,
    rackCode: asString(created.rack_code),
    position: Number(created.rack_position),
    hivDrtSampleId: asString(created.sample_id),
  })
  return getHivLabAlertWorkspace(actor)
}

export async function updateHivLabAlert(
  id: string,
  input: { hn?: string; patientName?: string },
  actor: BmActor,
) {
  assertHivLabAlertAccess(actor)
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('bm_hiv_lab_alerts')
    .select('id,hn,ln,patient_name_masked,line_status,line_sent_at')
    .eq('id', id)
    .maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ HIV LAB Alert')
  if (row.line_sent_at || asLineStatus(row.line_status) !== 'pending') throw new HttpError(409, 'ส่ง LINE แล้ว จึงแก้ไขไม่ได้')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const detail: Record<string, unknown> = { ln: asString(row.ln) }
  if (input.hn !== undefined) {
    patch.hn = input.hn.trim()
    detail.hn = input.hn.trim()
  }
  if (input.patientName !== undefined) {
    const patientNameMasked = maskPatientName(input.patientName)
    if (!patientNameMasked) throw new HttpError(400, 'กรุณาระบุชื่อ-นามสกุล')
    patch.patient_name_masked = patientNameMasked
    detail.patientNameMasked = patientNameMasked
  }
  const { data: updated, error: updateError } = await admin
    .from('bm_hiv_lab_alerts')
    .update(patch)
    .eq('id', id)
    .eq('line_status', 'pending')
    .select('id')
    .maybeSingle()
  fail(updateError)
  if (!updated) throw new HttpError(409, 'รายการนี้กำลังถูกดำเนินการ กรุณาลองใหม่')
  await writeAudit(actor, 'hiv_lab_alert.update', 'hiv-lab-alert', id, detail)
  return getHivLabAlertWorkspace(actor)
}

export async function deleteHivLabAlert(id: string, actor: BmActor) {
  assertHivLabAlertAccess(actor)
  const admin = getAdminClient()
  const { data, error } = await admin.from('bm_hiv_lab_alerts').select('id,hn,ln').eq('id', id).maybeSingle()
  fail(error)
  const row = data as RecordRow | null
  if (!row) throw new HttpError(404, 'ไม่พบ HIV LAB Alert')
  const { error: deleteError } = await admin.rpc('delete_hiv_lab_alert', { p_alert_id: id, p_actor: actor.id })
  fail(deleteError)
  await writeAudit(actor, 'hiv_lab_alert.delete', 'hiv-lab-alert', id, { hn: asString(row.hn), ln: asString(row.ln) })
  return getHivLabAlertWorkspace(actor)
}

type SendRow = RecordRow & {
  id: string
  hn: string
  ln: string
  patient_name_masked: string
  line_status: HivLabAlertLineStatus
  line_sent_at: string | null
  line_send_attempts: number
  line_retry_key: string | null
  line_send_started_at: string | null
  line_message_date: string | null
}

function sendRow(row: RecordRow): SendRow {
  return {
    ...row,
    id: asString(row.id),
    hn: asString(row.hn),
    ln: asString(row.ln),
    patient_name_masked: asString(row.patient_name_masked),
    line_status: row.line_sent_at ? 'sent' : asLineStatus(row.line_status),
    line_sent_at: nullableString(row.line_sent_at),
    line_send_attempts: Number(row.line_send_attempts ?? 0),
    line_retry_key: nullableString(row.line_retry_key),
    line_send_started_at: nullableString(row.line_send_started_at),
    line_message_date: nullableString(row.line_message_date),
  }
}

function sendingIsRecent(value: string | null) {
  if (!value) return false
  const elapsed = Date.now() - new Date(value).getTime()
  return Number.isFinite(elapsed) && elapsed < 5 * 60 * 1000
}

async function resetFailedSend(id: string, retryKey: string, attempt: number, actor: BmActor, status: number | 'transport') {
  const admin = getAdminClient()
  const { error } = await admin
    .from('bm_hiv_lab_alerts')
    .update({ line_status: 'pending', line_send_started_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('line_status', 'sending')
    .eq('line_retry_key', retryKey)
  fail(error)
  await writeAudit(
    actor,
    'hiv_lab_alert.line_send_failed',
    'hiv-lab-alert',
    id,
    { status, attempt },
  ).catch(() => undefined)
}

export async function sendHivLabAlert(id: string, actor: BmActor) {
  assertHivLabAlertAccess(actor)
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()
  const groupId = process.env.LINE_GROUP_ID?.trim()
  if (!token || !groupId) throw new HttpError(503, 'ยังไม่ได้ตั้งค่า LINE integration')

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('bm_hiv_lab_alerts')
    .select('id,hn,ln,patient_name_masked,line_status,line_sent_at,line_send_attempts,line_retry_key,line_send_started_at,line_message_date')
    .eq('id', id)
    .maybeSingle()
  fail(error)
  const loaded = data as RecordRow | null
  if (!loaded) throw new HttpError(404, 'ไม่พบ HIV LAB Alert')
  const row = sendRow(loaded)
  if (row.line_sent_at || row.line_status === 'sent') throw new HttpError(409, 'รายการนี้ส่งสำเร็จแล้ว')
  if (row.line_status === 'sending' && sendingIsRecent(row.line_send_started_at)) {
    throw new HttpError(409, 'รายการนี้กำลังส่งอยู่ กรุณารอสักครู่')
  }

  const now = new Date()
  const retryKey = row.line_retry_key ?? crypto.randomUUID()
  const messageDate = row.line_message_date ?? bangkokDateKey(now)
  const nextAttempt = row.line_send_attempts + 1
  let claim = admin
    .from('bm_hiv_lab_alerts')
    .update({
      line_status: 'sending',
      line_send_started_at: now.toISOString(),
      line_retry_key: retryKey,
      line_message_date: messageDate,
      line_send_attempts: nextAttempt,
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('line_status', row.line_status)
  if (row.line_send_started_at) claim = claim.eq('line_send_started_at', row.line_send_started_at)
  else claim = claim.is('line_send_started_at', null)
  const { data: claimed, error: claimError } = await claim.select('id').maybeSingle()
  fail(claimError)
  if (!claimed) throw new HttpError(409, 'รายการนี้ถูกเปิดส่งโดยผู้ใช้อื่น กรุณาลองใหม่')

  const message = buildHivLabAlertMessage({
    hn: row.hn,
    ln: row.ln,
    patientNameMasked: row.patient_name_masked,
    sentAt: `${messageDate}T00:00:00+07:00`,
  })
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Line-Retry-Key': retryKey,
  }
  let response: Response
  try {
    response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text: message }] }),
      cache: 'no-store',
    })
  } catch {
    await resetFailedSend(id, retryKey, nextAttempt, actor, 'transport')
    throw new HttpError(502, 'ส่ง LINE ไม่สำเร็จ กรุณาลองอีกครั้ง')
  }
  if (!response.ok) {
    await resetFailedSend(id, retryKey, nextAttempt, actor, response.status)
    throw new HttpError(502, 'ส่ง LINE ไม่สำเร็จ กรุณาลองอีกครั้ง')
  }

  const sentAt = new Date().toISOString()
  const { data: sent, error: sentError } = await admin
    .from('bm_hiv_lab_alerts')
    .update({
      line_status: 'sent',
      line_sent_at: sentAt,
      line_sent_by: actor.id,
      line_send_started_at: null,
      updated_at: sentAt,
    })
    .eq('id', id)
    .eq('line_status', 'sending')
    .eq('line_retry_key', retryKey)
    .select('id')
    .maybeSingle()
  fail(sentError)
  if (!sent) throw new HttpError(502, 'LINE ส่งสำเร็จแต่ระบบยืนยันสถานะไม่ได้ กรุณาติดต่อผู้ดูแลระบบ')
  await writeAudit(actor, 'hiv_lab_alert.line_send', 'hiv-lab-alert', id, { hn: row.hn, ln: row.ln, messageDate })
  return getHivLabAlertWorkspace(actor)
}
