import 'server-only'

import type { BmActor, BmRole } from '@/lib/bm/types'
import type { MorningTalk, MorningTalkAttendee, MorningTalkUser, MorningTalkWorkspace } from '@/lib/morning-talk/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, fallback = 'Morning Talk database operation failed') {
  if (error) throw new HttpError(400, error.message || fallback)
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
function asRole(value: unknown): BmRole {
  return value === 'Admin' || value === 'Assistant' ? value : 'Staff'
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Morning Talk admin permission required')
}

async function loadUsers(): Promise<{ active: MorningTalkUser[]; allById: Map<string, MorningTalkUser> }> {
  const admin = getAdminClient()
  const [{ data: profileData, error: profileError }, { data: accessData, error: accessError }] = await Promise.all([
    admin.from('nipt_users').select('id,ephis_id,display_name,is_active').order('display_name'),
    admin.from('bm_user_access').select('user_id,role,is_active'),
  ])
  fail(profileError)
  fail(accessError)
  const accessById = new Map(((accessData ?? []) as RecordRow[]).map((row) => [asString(row.user_id), row]))
  const all = ((profileData ?? []) as RecordRow[]).map((row) => {
    const access = accessById.get(asString(row.id))
    return {
      id: asString(row.id),
      ephisId: asString(row.ephis_id),
      displayName: asString(row.display_name),
      role: asRole(access?.role),
      active: Boolean(row.is_active) && Boolean(access?.is_active),
    }
  })
  const toMorningTalkUser = (user: typeof all[number]): MorningTalkUser => ({ id: user.id, ephisId: user.ephisId, displayName: user.displayName, role: user.role })
  const active = all.filter((user) => user.active).map(toMorningTalkUser)
  const allById = new Map(all.map((user) => [user.id, toMorningTalkUser(user)]))
  return { active, allById }
}

async function assertActiveAttendees(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) throw new HttpError(400, 'Select at least one meeting attendee')
  const { active } = await loadUsers()
  const activeIds = new Set(active.map((user) => user.id))
  if (unique.some((userId) => !activeIds.has(userId))) throw new HttpError(400, 'One or more selected meeting attendees are not active')
  return unique
}

export async function getMorningTalkWorkspace(actor: BmActor): Promise<MorningTalkWorkspace> {
  void actor
  const admin = getAdminClient()
  const [{ data: talkData, error: talkError }, { data: attendeeData, error: attendeeError }, users] = await Promise.all([
    admin.from('morning_talks').select('*').order('talk_date', { ascending: false }).order('created_at', { ascending: false }).limit(120),
    admin.from('morning_talk_attendees').select('*'),
    loadUsers(),
  ])
  fail(talkError)
  fail(attendeeError)
  const attendeesByTalk = new Map<string, MorningTalkAttendee[]>()
  for (const row of (attendeeData ?? []) as RecordRow[]) {
    const userId = asString(row.user_id)
    const user = users.allById.get(userId)
    const attendee: MorningTalkAttendee = {
      userId,
      displayName: user?.displayName ?? 'Unknown user',
      ephisId: user?.ephisId ?? '',
      role: user?.role ?? 'Staff',
      acknowledgedAt: nullableString(row.acknowledged_at),
    }
    const talkId = asString(row.talk_id)
    attendeesByTalk.set(talkId, [...(attendeesByTalk.get(talkId) ?? []), attendee])
  }
  const talks: MorningTalk[] = ((talkData ?? []) as RecordRow[]).map((row) => {
    const createdBy = users.allById.get(asString(row.created_by))
    return {
      id: asString(row.id),
      talkDate: asString(row.talk_date),
      title: asString(row.title),
      agenda: nullableString(row.agenda),
      createdByName: createdBy?.displayName ?? null,
      createdAt: asString(row.created_at),
      attendees: (attendeesByTalk.get(asString(row.id)) ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }
  })
  return { talks, users: users.active }
}

export async function createMorningTalk(input: { talkDate: string; title: string; agenda?: string | null; attendeeIds: string[] }, actor: BmActor) {
  assertAdmin(actor)
  const attendeeIds = await assertActiveAttendees(input.attendeeIds)
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('morning_talks')
    .insert({ talk_date: input.talkDate, title: input.title.trim(), agenda: clean(input.agenda), created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  const { error: attendeeError } = await admin.from('morning_talk_attendees').insert(attendeeIds.map((userId) => ({ talk_id: id, user_id: userId })))
  fail(attendeeError)
  await writeAudit(actor, 'morning-talk.create', 'morning-talk', id, { talkDate: input.talkDate, title: input.title.trim(), attendeeIds })
  return getMorningTalkWorkspace(actor)
}

export async function updateMorningTalk(id: string, input: { talkDate?: string; title?: string; agenda?: string | null; attendeeIds?: string[] }, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('morning_talks').select('id').eq('id', id).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'Morning Talk not found')
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.talkDate !== undefined) updates.talk_date = input.talkDate
  if (input.title !== undefined) updates.title = input.title.trim()
  if (input.agenda !== undefined) updates.agenda = clean(input.agenda)
  const { error } = await admin.from('morning_talks').update(updates).eq('id', id)
  fail(error)
  if (input.attendeeIds !== undefined) {
    const attendeeIds = await assertActiveAttendees(input.attendeeIds)
    const { data: currentAttendees, error: attendeeError } = await admin.from('morning_talk_attendees').select('user_id').eq('talk_id', id)
    fail(attendeeError)
    const existingIds = new Set(((currentAttendees ?? []) as RecordRow[]).map((row) => asString(row.user_id)))
    const removedIds = [...existingIds].filter((userId) => !attendeeIds.includes(userId))
    const addedIds = attendeeIds.filter((userId) => !existingIds.has(userId))
    if (removedIds.length) {
      const { error: removeError } = await admin.from('morning_talk_attendees').delete().eq('talk_id', id).in('user_id', removedIds)
      fail(removeError)
    }
    if (addedIds.length) {
      const { error: addError } = await admin.from('morning_talk_attendees').insert(addedIds.map((userId) => ({ talk_id: id, user_id: userId })))
      fail(addError)
    }
  }
  await writeAudit(actor, 'morning-talk.update', 'morning-talk', id, input)
  return getMorningTalkWorkspace(actor)
}

export async function deleteMorningTalk(id: string, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().from('morning_talks').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'morning-talk.delete', 'morning-talk', id, {})
  return getMorningTalkWorkspace(actor)
}

export async function acknowledgeMorningTalk(id: string, actor: BmActor) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('morning_talk_attendees')
    .select('acknowledged_at')
    .eq('talk_id', id)
    .eq('user_id', actor.id)
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(403, 'You are not assigned to this Morning Talk')
  if (!(data as RecordRow).acknowledged_at) {
    const { error: updateError } = await admin
      .from('morning_talk_attendees')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('talk_id', id)
      .eq('user_id', actor.id)
    fail(updateError)
    await writeAudit(actor, 'morning-talk.acknowledge', 'morning-talk', id, {})
  }
  return getMorningTalkWorkspace(actor)
}
