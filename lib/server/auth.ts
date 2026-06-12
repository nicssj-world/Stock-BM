import 'server-only'

import { redirect } from 'next/navigation'
import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type RecordRow = Record<string, unknown>

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function getActor(): Promise<BmActor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = getAdminClient()
  const [{ data: profile, error: profileError }, { data: access, error: accessError }] = await Promise.all([
    admin.from('nipt_users').select('id,ephis_id,display_name,role,is_active').eq('id', user.id).maybeSingle(),
    admin.from('bm_user_access').select('user_id,role,is_active').eq('user_id', user.id).maybeSingle(),
  ])
  if (profileError || accessError) return null
  const profileRow = profile as RecordRow | null
  const accessRow = access as RecordRow | null
  if (!profileRow?.is_active || !accessRow?.is_active) return null

  return {
    id: asString(profileRow.id),
    ephisId: asString(profileRow.ephis_id),
    displayName: asString(profileRow.display_name),
    genomicRole: asString(profileRow.role) === 'Admin' ? 'Admin' : 'CBH-Staff',
    role: asString(accessRow.role) === 'Admin' ? 'Admin' : 'Staff',
  }
}

export async function requireActor() {
  const actor = await getActor()
  if (!actor) throw new HttpError(401, 'Unauthorized')
  return actor
}

export async function requireStockAdmin() {
  const actor = await requireActor()
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
  return actor
}

export async function requirePageActor() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

export async function requireAdminPageActor() {
  const actor = await requirePageActor()
  if (actor.role !== 'Admin') redirect('/dashboard')
  return actor
}

