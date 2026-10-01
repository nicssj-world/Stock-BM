import 'server-only'

import type { BmActor, BmRole } from '@/lib/bm/types'
import { todayBangkok } from '@/lib/bm/rules'
import { formatThaiMonthYear } from '@/lib/bm/thai-date'
import { dueDateForMonth, monthStart } from '@/lib/monthly-tasks/rules'
import type { MonthlyTask, MonthlyTaskTemplate, MonthlyTaskUser, MonthlyTaskWorkspace } from '@/lib/monthly-tasks/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, fallback = 'Monthly task database operation failed') {
  if (error) throw new HttpError(400, error.message || fallback)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asBoolean(value: unknown) {
  return value === true
}

function asNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asBmRole(value: unknown): BmRole {
  const role = asString(value)
  if (role === 'Admin' || role === 'Assistant') return role
  return 'Staff'
}

function clean(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new HttpError(400, 'Task title is required')
  return trimmed
}

function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Monthly task admin permission required')
}

type LoadedUsers = {
  active: MonthlyTaskUser[]
  allById: Map<string, MonthlyTaskUser>
}

async function loadUsers(): Promise<LoadedUsers> {
  const admin = getAdminClient()
  const [{ data: profileData, error: profileError }, { data: accessData, error: accessError }] = await Promise.all([
    admin.from('nipt_users').select('id,ephis_id,display_name,is_active').order('display_name'),
    admin.from('bm_user_access').select('user_id,role,is_active'),
  ])
  fail(profileError)
  fail(accessError)

  const accessById = new Map(((accessData ?? []) as RecordRow[]).map((row) => [asString(row.user_id), row]))
  const all = ((profileData ?? []) as RecordRow[]).map((row): MonthlyTaskUser & { active: boolean } => {
    const access = accessById.get(asString(row.id))
    const role = asBmRole(access?.role)
    return {
      id: asString(row.id),
      ephisId: asString(row.ephis_id),
      displayName: asString(row.display_name),
      role,
      active: Boolean(row.is_active) && Boolean(access?.is_active) && (role === 'Admin' || role === 'Staff'),
    }
  })

  const toUser = (user: MonthlyTaskUser & { active: boolean }): MonthlyTaskUser => ({
    id: user.id,
    ephisId: user.ephisId,
    displayName: user.displayName,
    role: user.role,
  })
  return {
    active: all.filter((user) => user.active).map(toUser),
    allById: new Map(all.map((user) => [user.id, toUser(user)])),
  }
}

function mapTemplate(row: RecordRow, users: LoadedUsers): MonthlyTaskTemplate {
  const assigneeId = asString(row.assignee_id)
  return {
    id: asString(row.id),
    title: asString(row.title),
    assigneeId,
    assigneeName: users.allById.get(assigneeId)?.displayName ?? 'ไม่พบผู้รับผิดชอบ',
    dueDay: asNumber(row.due_day),
    isActive: asBoolean(row.is_active),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function mapTask(row: RecordRow, users: LoadedUsers): MonthlyTask {
  const assigneeId = asString(row.assignee_id)
  const completedById = nullableString(row.completed_by)
  return {
    id: asString(row.id),
    templateId: asString(row.template_id),
    title: asString(row.title),
    assigneeId,
    assigneeName: users.allById.get(assigneeId)?.displayName ?? 'ไม่พบผู้รับผิดชอบ',
    deadline: asString(row.deadline),
    isCompleted: asBoolean(row.is_completed),
    completedAt: nullableString(row.completed_at),
    completedByName: completedById ? users.allById.get(completedById)?.displayName ?? null : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

async function getActiveTemplates() {
  const { data, error } = await getAdminClient()
    .from('bm_monthly_task_templates')
    .select('*')
    .eq('is_active', true)
    .order('due_day', { ascending: true })
    .order('title', { ascending: true })
  fail(error)
  return (data ?? []) as RecordRow[]
}

async function ensureMonthOccurrences(month: string, templates: RecordRow[]) {
  if (!templates.length) return
  const taskMonth = monthStart(month)
  const rows = templates.map((template) => ({
    template_id: asString(template.id),
    task_month: taskMonth,
    title: asString(template.title),
    assignee_id: asString(template.assignee_id),
    deadline: dueDateForMonth(month, asNumber(template.due_day)),
  }))
  const { error } = await getAdminClient()
    .from('bm_monthly_task_occurrences')
    .upsert(rows, { onConflict: 'template_id,task_month', ignoreDuplicates: true })
  fail(error)
}

export async function getMonthlyTaskWorkspace(month: string): Promise<MonthlyTaskWorkspace> {
  const taskMonth = monthStart(month)
  const [templateRows, users] = await Promise.all([getActiveTemplates(), loadUsers()])
  await ensureMonthOccurrences(month, templateRows)

  const { data: taskData, error: taskError } = await getAdminClient()
    .from('bm_monthly_task_occurrences')
    .select('*')
    .eq('task_month', taskMonth)
    .order('is_completed', { ascending: true })
    .order('deadline', { ascending: true })
    .order('title', { ascending: true })
  fail(taskError)

  const templates = templateRows.map((row) => mapTemplate(row, users))
  const tasks = ((taskData ?? []) as RecordRow[]).map((row) => mapTask(row, users))
  const today = todayBangkok()
  const completedCount = tasks.filter((task) => task.isCompleted).length
  const overdueCount = tasks.filter((task) => !task.isCompleted && task.deadline < today).length

  return {
    month,
    monthLabel: formatThaiMonthYear(taskMonth),
    templates,
    tasks,
    users: users.active,
    totalCount: tasks.length,
    completedCount,
    openCount: tasks.length - completedCount,
    overdueCount,
  }
}

async function getTemplateById(id: string) {
  const { data, error } = await getAdminClient().from('bm_monthly_task_templates').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Monthly task template not found')
  return data as RecordRow
}

async function assertAssignableUser(userId: string, users: LoadedUsers) {
  if (!users.active.some((user) => user.id === userId)) throw new HttpError(400, 'Assignee must be an active Stock-BM user')
}

function dueDay(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 31) throw new HttpError(400, 'Deadline must be between day 1 and 31')
  return value
}

export async function createMonthlyTaskTemplate(input: { month: string; title: string; assigneeId: string; dueDay: number }, actor: BmActor) {
  assertAdmin(actor)
  const users = await loadUsers()
  await assertAssignableUser(input.assigneeId, users)
  const title = clean(input.title)
  const validDueDay = dueDay(input.dueDay)
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('bm_monthly_task_templates')
    .insert({ title, assignee_id: input.assigneeId, due_day: validDueDay, created_by: actor.id })
    .select('*')
    .single()
  fail(error)
  await ensureMonthOccurrences(input.month, [data as RecordRow])
  await writeAudit(actor, 'monthly-task.template.create', 'monthly-task-template', asString((data as RecordRow).id), { title, assigneeId: input.assigneeId, dueDay: validDueDay })
  return getMonthlyTaskWorkspace(input.month)
}

export async function updateMonthlyTaskTemplate(id: string, input: { month: string; title?: string; assigneeId?: string; dueDay?: number }, actor: BmActor) {
  assertAdmin(actor)
  const current = await getTemplateById(id)
  if (!asBoolean(current.is_active)) throw new HttpError(400, 'Inactive monthly task templates cannot be edited')
  const users = await loadUsers()
  const title = input.title === undefined ? asString(current.title) : clean(input.title)
  const assigneeId = input.assigneeId ?? asString(current.assignee_id)
  await assertAssignableUser(assigneeId, users)
  const validDueDay = input.dueDay === undefined ? asNumber(current.due_day) : dueDay(input.dueDay)
  const admin = getAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('bm_monthly_task_templates')
    .update({ title, assignee_id: assigneeId, due_day: validDueDay, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  fail(error)

  const updatedTemplate = data as RecordRow
  await ensureMonthOccurrences(input.month, [updatedTemplate])
  const { error: occurrenceError } = await admin
    .from('bm_monthly_task_occurrences')
    .update({ title, assignee_id: assigneeId, deadline: dueDateForMonth(input.month, validDueDay), updated_at: now })
    .eq('template_id', id)
    .eq('task_month', monthStart(input.month))
    .eq('is_completed', false)
  fail(occurrenceError)
  await writeAudit(actor, 'monthly-task.template.update', 'monthly-task-template', id, { title, assigneeId, dueDay: validDueDay })
  return getMonthlyTaskWorkspace(input.month)
}

export async function deactivateMonthlyTaskTemplate(id: string, month: string, actor: BmActor) {
  assertAdmin(actor)
  const current = await getTemplateById(id)
  if (!asBoolean(current.is_active)) throw new HttpError(400, 'Monthly task template is already inactive')
  const { error } = await getAdminClient()
    .from('bm_monthly_task_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  fail(error)
  await writeAudit(actor, 'monthly-task.template.deactivate', 'monthly-task-template', id, { title: asString(current.title) })
  return getMonthlyTaskWorkspace(month)
}

export async function updateMonthlyTaskOccurrence(id: string, input: { month: string; completed: boolean }, actor: BmActor) {
  const { data, error } = await getAdminClient().from('bm_monthly_task_occurrences').select('*').eq('id', id).eq('task_month', monthStart(input.month)).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Monthly task not found for this month')
  const row = data as RecordRow
  const assigneeId = asString(row.assignee_id)
  if (actor.role !== 'Admin' && actor.id !== assigneeId) throw new HttpError(403, 'Only the assignee or an Admin can update this monthly task')

  const completedAt = input.completed ? new Date().toISOString() : null
  const { error: updateError } = await getAdminClient()
    .from('bm_monthly_task_occurrences')
    .update({ is_completed: input.completed, completed_at: completedAt, completed_by: input.completed ? actor.id : null, updated_at: new Date().toISOString() })
    .eq('id', id)
  fail(updateError)
  await writeAudit(actor, input.completed ? 'monthly-task.complete' : 'monthly-task.reopen', 'monthly-task', id, { month: input.month, title: asString(row.title) })
  return getMonthlyTaskWorkspace(input.month)
}
