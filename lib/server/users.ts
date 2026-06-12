import 'server-only'

import type { AdminUserRow, BmActor, BmRole, GenomicRole } from '@/lib/bm/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'User database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

async function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const admin = getAdminClient()
  const [{ data: profileData, error: profileError }, { data: accessData, error: accessError }] = await Promise.all([
    admin.from('nipt_users').select('*').order('display_name'),
    admin.from('bm_user_access').select('*'),
  ])
  fail(profileError)
  fail(accessError)
  const accessMap = new Map(((accessData ?? []) as RecordRow[]).map((row) => [asString(row.user_id), row]))
  return ((profileData ?? []) as RecordRow[]).map((row) => {
    const access = accessMap.get(asString(row.id))
    return {
      id: asString(row.id),
      ephisId: asString(row.ephis_id),
      displayName: asString(row.display_name),
      genomicRole: asString(row.role) === 'Admin' ? 'Admin' : 'CBH-Staff',
      genomicActive: Boolean(row.is_active),
      stockRole: access ? (asString(access.role) === 'Admin' ? 'Admin' : 'Staff') : null,
      stockActive: Boolean(access?.is_active),
      createdAt: asString(row.created_at),
    }
  })
}

export async function createOrGrantUser(input: {
  ephisId: string
  displayName: string
  password: string
  stockRole: BmRole
  genomicRole?: GenomicRole
}, actor: BmActor) {
  await assertAdmin(actor)
  const admin = getAdminClient()
  const ephisId = input.ephisId.trim()
  const { data: existing, error: existingError } = await admin.from('nipt_users').select('*').eq('ephis_id', ephisId).maybeSingle()
  fail(existingError)
  let userId = asString((existing as RecordRow | null)?.id)
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `${ephisId}@nipt.cbh.go.th`,
      password: input.password,
      email_confirm: true,
    })
    fail(error)
    userId = data.user!.id
    const { error: profileError } = await admin.from('nipt_users').insert({
      id: userId,
      ephis_id: ephisId,
      display_name: input.displayName.trim(),
      role: input.genomicRole ?? 'CBH-Staff',
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      fail(profileError)
    }
  } else {
    const { error } = await admin
      .from('nipt_users')
      .update({ display_name: input.displayName.trim(), role: input.genomicRole ?? 'CBH-Staff', is_active: true, updated_at: new Date().toISOString() })
      .eq('id', userId)
    fail(error)
  }

  const { error: accessError } = await admin.from('bm_user_access').upsert({
    user_id: userId,
    role: input.stockRole,
    is_active: true,
    created_by: actor.id,
    updated_at: new Date().toISOString(),
  })
  fail(accessError)
  await writeAudit(actor, 'user.grant', 'user', userId, { ephisId, stockRole: input.stockRole })
  return userId
}

export async function updateUserAccess(
  userId: string,
  input: { displayName?: string; genomicRole?: GenomicRole; genomicActive?: boolean; stockRole?: BmRole; stockActive?: boolean },
  actor: BmActor,
) {
  await assertAdmin(actor)
  if (userId === actor.id && input.stockActive === false) throw new HttpError(400, 'You cannot deactivate your own Stock-BM access')
  const admin = getAdminClient()
  const profileUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.displayName !== undefined) profileUpdates.display_name = input.displayName.trim()
  if (input.genomicRole !== undefined) profileUpdates.role = input.genomicRole
  if (input.genomicActive !== undefined) profileUpdates.is_active = input.genomicActive
  if (Object.keys(profileUpdates).length > 1) {
    const { error } = await admin.from('nipt_users').update(profileUpdates).eq('id', userId)
    fail(error)
  }
  if (input.stockRole !== undefined || input.stockActive !== undefined) {
    const { error } = await admin.from('bm_user_access').upsert({
      user_id: userId,
      role: input.stockRole ?? 'Staff',
      is_active: input.stockActive ?? true,
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    fail(error)
  }
  await writeAudit(actor, 'user.update', 'user', userId, input)
}

export async function resetUserPassword(userId: string, password: string, actor: BmActor) {
  await assertAdmin(actor)
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, { password })
  fail(error)
  await writeAudit(actor, 'user.password.reset', 'user', userId)
}

