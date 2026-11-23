import 'server-only'

import { redirect } from 'next/navigation'
import type { BmActor, BmRole } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type RecordRow = Record<string, unknown>

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asBmRole(value: unknown): BmRole {
  const role = asString(value)
  if (role === 'Admin' || role === 'Assistant' || role === 'Signer') return role
  return 'Staff'
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
    role: asBmRole(accessRow.role),
  }
}

/** Where each role lands after signing in. */
export function homePathForRole(role: BmRole) {
  return role === 'Assistant' ? '/hpv' : role === 'Signer' ? '/eqa' : '/dashboard'
}

const SIGNER_DENIED = 'บัญชีผู้ลงนามใช้ได้เฉพาะการลงนามเอกสาร EQA และจัดการลายเซ็นของตัวเอง'

/** Any signed-in role, Signer included. Only routes a Signer may use call this. */
export async function requireAnyActor() {
  const actor = await getActor()
  if (!actor) throw new HttpError(401, 'Unauthorized')
  return actor
}

// Signer is denied by default: every API that goes through requireActor (and
// the helpers built on it) rejects it. Routes a Signer needs opt in explicitly
// with requireAnyActor / requireSigningActor.
export async function requireActor() {
  const actor = await requireAnyActor()
  if (actor.role === 'Signer') throw new HttpError(403, SIGNER_DENIED)
  return actor
}

export async function requireStockAdmin() {
  const actor = await requireActor()
  if (actor.role !== 'Admin') throw new HttpError(403, 'Stock Admin permission required')
  return actor
}

// Assistant is intentionally limited to the HPV workflow. Generic stock pages are
// hidden for that role; API routes must enforce the same boundary.
export async function requireStockOperator() {
  const actor = await requireActor()
  if (actor.role === 'Assistant') throw new HttpError(403, 'Stock Staff or Admin permission required')
  return actor
}

/** Admin, Staff or Signer: signing documents and managing one's own signature. */
export async function requireSigningActor() {
  const actor = await requireAnyActor()
  if (actor.role === 'Assistant') throw new HttpError(403, 'Stock Staff or Admin permission required')
  return actor
}

/** Signed-in, any role: only for the shared protected layout. */
export async function requireLayoutActor() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

export async function requirePageActor() {
  const actor = await requireLayoutActor()
  if (actor.role === 'Signer') redirect(homePathForRole(actor.role))
  return actor
}

export async function requireFullPageActor() {
  const actor = await requirePageActor()
  if (actor.role === 'Assistant') redirect('/hpv')
  return actor
}

/** Pages a Signer may open: EQA and their own signature. */
export async function requireSigningPageActor() {
  const actor = await requireLayoutActor()
  if (actor.role === 'Assistant') redirect('/hpv')
  return actor
}

export async function requireAdminPageActor() {
  const actor = await requirePageActor()
  if (actor.role !== 'Admin') redirect(homePathForRole(actor.role))
  return actor
}
