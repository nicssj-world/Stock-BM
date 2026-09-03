import 'server-only'

import type { BmActor, BmRole } from '@/lib/bm/types'
import type {
  MorningTalk,
  MorningTalkActionItem,
  MorningTalkActionStatus,
  MorningTalkAttendee,
  MorningTalkChecklistItem,
  MorningTalkUser,
  MorningTalkWorkspace,
} from '@/lib/morning-talk/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
type LoadedUsers = Awaited<ReturnType<typeof loadUsers>>
type ChecklistInput = { id?: string; title: string }
type ActionInput = {
  id?: string
  title: string
  ownerId?: string | null
  dueDate?: string | null
  status?: MorningTalkActionStatus
  note?: string | null
}

function fail(error: { message: string } | null, fallback = 'Morning Talk database operation failed') {
  if (error) throw new HttpError(400, error.message || fallback)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function asActionStatus(value: unknown): MorningTalkActionStatus {
  if (value === 'in-progress' || value === 'done') return value
  return 'todo'
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Morning Talk admin permission required')
}

function normalizeChecklistItems(items: ChecklistInput[] | undefined) {
  return (items ?? [])
    .map((item) => ({ id: item.id, title: item.title.trim() }))
    .filter((item) => item.title)
}

function normalizeActionItems(items: ActionInput[] | undefined) {
  const normalized = (items ?? [])
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      ownerId: item.ownerId ?? null,
      dueDate: item.dueDate || null,
      status: item.status ?? 'todo',
      note: clean(item.note),
    }))
    .filter((item) => item.title)
  if (normalized.some((item) => !item.ownerId)) throw new HttpError(400, 'Each action item needs an owner')
  return normalized
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
      role: access?.role === 'Admin' || access?.role === 'Assistant' ? access.role : 'Staff',
      active: Boolean(row.is_active) && Boolean(access?.is_active),
    }
  })
  const toMorningTalkUser = (user: typeof all[number]): MorningTalkUser => ({ id: user.id, ephisId: user.ephisId, displayName: user.displayName, role: user.role as BmRole })
  const active = all.filter((user) => user.active).map(toMorningTalkUser)
  const allById = new Map(all.map((user) => [user.id, toMorningTalkUser(user)]))
  return { active, allById }
}

async function assertActiveUsers(userIds: string[], users?: LoadedUsers) {
  const unique = [...new Set(userIds.filter(Boolean))]
  const loaded = users ?? await loadUsers()
  const activeIds = new Set(loaded.active.map((user) => user.id))
  if (unique.some((userId) => !activeIds.has(userId))) throw new HttpError(400, 'One or more selected users are not active')
  return unique
}

async function assertActiveAttendees(userIds: string[], users?: LoadedUsers) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) throw new HttpError(400, 'Select at least one meeting attendee')
  return assertActiveUsers(unique, users)
}

export async function getMorningTalkWorkspace(actor: BmActor): Promise<MorningTalkWorkspace> {
  void actor
  const admin = getAdminClient()
  const [
    { data: talkData, error: talkError },
    { data: attendeeData, error: attendeeError },
    { data: checklistData, error: checklistError },
    { data: actionData, error: actionError },
    users,
  ] = await Promise.all([
    admin.from('morning_talks').select('*').order('talk_date', { ascending: false }).order('created_at', { ascending: false }).limit(120),
    admin.from('morning_talk_attendees').select('*'),
    admin.from('morning_talk_checklist_items').select('*'),
    admin.from('morning_talk_action_items').select('*'),
    loadUsers(),
  ])
  fail(talkError)
  fail(attendeeError)
  fail(checklistError)
  fail(actionError)

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
    const current = attendeesByTalk.get(talkId) ?? []
    current.push(attendee)
    attendeesByTalk.set(talkId, current)
  }

  const checklistByTalk = new Map<string, MorningTalkChecklistItem[]>()
  for (const row of (checklistData ?? []) as RecordRow[]) {
    const completedBy = users.allById.get(asString(row.completed_by))
    const item: MorningTalkChecklistItem = {
      id: asString(row.id),
      title: asString(row.title),
      sortOrder: asNumber(row.sort_order),
      completedAt: nullableString(row.completed_at),
      completedByName: completedBy?.displayName ?? null,
    }
    const talkId = asString(row.talk_id)
    const current = checklistByTalk.get(talkId) ?? []
    current.push(item)
    checklistByTalk.set(talkId, current)
  }

  const actionsByTalk = new Map<string, MorningTalkActionItem[]>()
  for (const row of (actionData ?? []) as RecordRow[]) {
    const ownerId = nullableString(row.owner_id)
    const owner = ownerId ? users.allById.get(ownerId) : undefined
    const item: MorningTalkActionItem = {
      id: asString(row.id),
      title: asString(row.title),
      ownerId,
      ownerName: owner?.displayName ?? null,
      dueDate: nullableString(row.due_date),
      status: asActionStatus(row.status),
      note: nullableString(row.note),
      completedAt: nullableString(row.completed_at),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    }
    const talkId = asString(row.talk_id)
    const current = actionsByTalk.get(talkId) ?? []
    current.push(item)
    actionsByTalk.set(talkId, current)
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
      checklistItems: (checklistByTalk.get(asString(row.id)) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
      actionItems: (actionsByTalk.get(asString(row.id)) ?? []).sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.title.localeCompare(b.title)),
    }
  })
  return { talks, users: users.active }
}

async function syncChecklistItems(id: string, items: ReturnType<typeof normalizeChecklistItems>) {
  const admin = getAdminClient()
  const { data: existingData, error: existingError } = await admin.from('morning_talk_checklist_items').select('*').eq('talk_id', id)
  fail(existingError)
  const existing = (existingData ?? []) as RecordRow[]
  const existingById = new Map(existing.map((row) => [asString(row.id), row]))
  const seenIds = new Set<string>()
  const now = new Date().toISOString()
  const rows = items.map((item, index) => {
    if (!item.id) return { talk_id: id, title: item.title, sort_order: index, updated_at: now }
    if (!existingById.has(item.id)) throw new HttpError(400, 'Checklist item does not belong to this Morning Talk')
    if (seenIds.has(item.id)) throw new HttpError(400, 'Duplicate checklist item')
    seenIds.add(item.id)
    const current = existingById.get(item.id) as RecordRow
    return {
      id: item.id,
      talk_id: id,
      title: item.title,
      sort_order: index,
      completed_at: nullableString(current.completed_at),
      completed_by: nullableString(current.completed_by),
      created_at: asString(current.created_at),
      updated_at: now,
    }
  })
  if (rows.length) {
    const { error } = await admin.from('morning_talk_checklist_items').upsert(rows, { onConflict: 'id' })
    fail(error)
  }
  const removedIds = existing.map((row) => asString(row.id)).filter((itemId) => !seenIds.has(itemId))
  if (removedIds.length) {
    const { error } = await admin.from('morning_talk_checklist_items').delete().in('id', removedIds)
    fail(error)
  }
}

async function syncActionItems(id: string, items: ReturnType<typeof normalizeActionItems>, actor: BmActor) {
  const admin = getAdminClient()
  const { data: existingData, error: existingError } = await admin.from('morning_talk_action_items').select('*').eq('talk_id', id)
  fail(existingError)
  const existing = (existingData ?? []) as RecordRow[]
  const existingById = new Map(existing.map((row) => [asString(row.id), row]))
  const seenIds = new Set<string>()
  const now = new Date().toISOString()
  const rows = items.map((item) => {
    if (item.id && !existingById.has(item.id)) throw new HttpError(400, 'Action item does not belong to this Morning Talk')
    if (item.id && seenIds.has(item.id)) throw new HttpError(400, 'Duplicate action item')
    if (item.id) seenIds.add(item.id)
    const current = item.id ? existingById.get(item.id) : undefined
    const completed = item.status === 'done'
    return {
      ...(item.id ? { id: item.id } : {}),
      talk_id: id,
      title: item.title,
      owner_id: item.ownerId,
      due_date: item.dueDate,
      status: item.status,
      note: item.note,
      completed_at: completed ? nullableString(current?.completed_at) ?? now : null,
      completed_by: completed ? nullableString(current?.completed_by) ?? actor.id : null,
      created_by: nullableString(current?.created_by) ?? actor.id,
      created_at: nullableString(current?.created_at) ?? now,
      updated_at: now,
    }
  })
  if (rows.length) {
    const { error } = await admin.from('morning_talk_action_items').upsert(rows, { onConflict: 'id' })
    fail(error)
  }
  const removedIds = existing.map((row) => asString(row.id)).filter((itemId) => !seenIds.has(itemId))
  if (removedIds.length) {
    const { error } = await admin.from('morning_talk_action_items').delete().in('id', removedIds)
    fail(error)
  }
}

export async function createMorningTalk(
  input: {
    talkDate: string
    title: string
    agenda?: string | null
    attendeeIds: string[]
    checklistItems?: ChecklistInput[]
    actionItems?: ActionInput[]
  },
  actor: BmActor,
) {
  assertAdmin(actor)
  const users = await loadUsers()
  const attendeeIds = await assertActiveAttendees(input.attendeeIds, users)
  const checklistItems = normalizeChecklistItems(input.checklistItems)
  const actionItems = normalizeActionItems(input.actionItems)
  await assertActiveUsers(actionItems.map((item) => item.ownerId ?? ''), users)
  const title = input.title.trim()
  if (!title) throw new HttpError(400, 'Morning Talk title is required')

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('morning_talks')
    .insert({ talk_date: input.talkDate, title, agenda: clean(input.agenda), created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  const { error: attendeeError } = await admin.from('morning_talk_attendees').insert(attendeeIds.map((userId) => ({ talk_id: id, user_id: userId })))
  fail(attendeeError)
  if (checklistItems.length) {
    const { error: checklistError } = await admin.from('morning_talk_checklist_items').insert(checklistItems.map((item, index) => ({ talk_id: id, title: item.title, sort_order: index })))
    fail(checklistError)
  }
  if (actionItems.length) {
    const now = new Date().toISOString()
    const { error: actionError } = await admin.from('morning_talk_action_items').insert(actionItems.map((item) => ({
      talk_id: id,
      title: item.title,
      owner_id: item.ownerId,
      due_date: item.dueDate,
      status: item.status,
      note: item.note,
      completed_at: item.status === 'done' ? now : null,
      completed_by: item.status === 'done' ? actor.id : null,
      created_by: actor.id,
    })))
    fail(actionError)
  }
  await writeAudit(actor, 'morning-talk.create', 'morning-talk', id, { talkDate: input.talkDate, title, attendeeIds, checklistItems, actionItems })
  return getMorningTalkWorkspace(actor)
}

export async function updateMorningTalk(
  id: string,
  input: {
    talkDate?: string
    title?: string
    agenda?: string | null
    attendeeIds?: string[]
    checklistItems?: ChecklistInput[]
    actionItems?: ActionInput[]
  },
  actor: BmActor,
) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('morning_talks').select('id').eq('id', id).maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'Morning Talk not found')

  const users = input.attendeeIds !== undefined || input.actionItems !== undefined ? await loadUsers() : undefined
  const attendeeIds = input.attendeeIds === undefined ? undefined : await assertActiveAttendees(input.attendeeIds, users)
  const checklistItems = input.checklistItems === undefined ? undefined : normalizeChecklistItems(input.checklistItems)
  const actionItems = input.actionItems === undefined ? undefined : normalizeActionItems(input.actionItems)
  if (actionItems) await assertActiveUsers(actionItems.map((item) => item.ownerId ?? ''), users)
  if (input.title !== undefined && !input.title.trim()) throw new HttpError(400, 'Morning Talk title is required')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.talkDate !== undefined) updates.talk_date = input.talkDate
  if (input.title !== undefined) updates.title = input.title.trim()
  if (input.agenda !== undefined) updates.agenda = clean(input.agenda)
  const { error } = await admin.from('morning_talks').update(updates).eq('id', id)
  fail(error)
  if (attendeeIds !== undefined) {
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
  if (checklistItems !== undefined) await syncChecklistItems(id, checklistItems)
  if (actionItems !== undefined) await syncActionItems(id, actionItems, actor)
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

export async function updateMorningTalkChecklistItem(
  talkId: string,
  itemId: string,
  input: { completed: boolean },
  actor: BmActor,
) {
  const admin = getAdminClient()
  const { data: item, error: itemError } = await admin
    .from('morning_talk_checklist_items')
    .select('id,title')
    .eq('id', itemId)
    .eq('talk_id', talkId)
    .maybeSingle()
  fail(itemError)
  if (!item) throw new HttpError(404, 'Checklist item not found')
  if (actor.role !== 'Admin') {
    const { data: attendee, error: attendeeError } = await admin
      .from('morning_talk_attendees')
      .select('talk_id')
      .eq('talk_id', talkId)
      .eq('user_id', actor.id)
      .maybeSingle()
    fail(attendeeError)
    if (!attendee) throw new HttpError(403, 'Only assigned attendees can update the checklist')
  }
  const completedAt = input.completed ? new Date().toISOString() : null
  const { error } = await admin
    .from('morning_talk_checklist_items')
    .update({ completed_at: completedAt, completed_by: input.completed ? actor.id : null, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('talk_id', talkId)
  fail(error)
  await writeAudit(actor, input.completed ? 'morning-talk.checklist.complete' : 'morning-talk.checklist.reset', 'morning-talk-checklist', itemId, { talkId, title: asString((item as RecordRow).title) })
  return getMorningTalkWorkspace(actor)
}

export async function updateMorningTalkActionItem(
  talkId: string,
  actionId: string,
  input: {
    title?: string
    ownerId?: string | null
    dueDate?: string | null
    status?: MorningTalkActionStatus
    note?: string | null
  },
  actor: BmActor,
) {
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin
    .from('morning_talk_action_items')
    .select('*')
    .eq('id', actionId)
    .eq('talk_id', talkId)
    .maybeSingle()
  fail(currentError)
  if (!current) throw new HttpError(404, 'Action item not found')

  const isAdmin = actor.role === 'Admin'
  if (!isAdmin && asString((current as RecordRow).owner_id) !== actor.id) throw new HttpError(403, 'Only the action owner or Admin can update this action item')
  if (!isAdmin && (input.title !== undefined || input.ownerId !== undefined || input.dueDate !== undefined || input.note !== undefined)) {
    throw new HttpError(403, 'Only Admin can edit action item details')
  }
  if (isAdmin && input.ownerId) await assertActiveUsers([input.ownerId])

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title.trim()
  if (input.ownerId !== undefined) updates.owner_id = input.ownerId
  if (input.dueDate !== undefined) updates.due_date = input.dueDate || null
  if (input.note !== undefined) updates.note = clean(input.note)
  if (input.status !== undefined) {
    updates.status = input.status
    if (input.status === 'done') {
      updates.completed_at = nullableString((current as RecordRow).completed_at) ?? new Date().toISOString()
      updates.completed_by = nullableString((current as RecordRow).completed_by) ?? actor.id
    } else {
      updates.completed_at = null
      updates.completed_by = null
    }
  }
  const { error } = await admin.from('morning_talk_action_items').update(updates).eq('id', actionId).eq('talk_id', talkId)
  fail(error)
  await writeAudit(actor, 'morning-talk.action.update', 'morning-talk-action', actionId, { talkId, ...input })
  return getMorningTalkWorkspace(actor)
}
