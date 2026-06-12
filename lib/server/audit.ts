import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Audit operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

export async function writeAudit(
  actor: BmActor,
  action: string,
  entityType: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
) {
  const { error } = await getAdminClient().from('bm_audit_logs').insert({
    actor_id: actor.id,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    detail,
  })
  fail(error)
}

export async function listAuditLogs(limit = 160) {
  const { data, error } = await getAdminClient().from('bm_audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  const actorIds = [...new Set(rows.map((row) => asString(row.actor_id)).filter(Boolean))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const { data: users, error: userError } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', actorIds)
    fail(userError)
    ;((users ?? []) as RecordRow[]).forEach((user) => names.set(asString(user.id), asString(user.display_name)))
  }
  return rows.map((row) => ({
    id: Number(row.id),
    actorName: names.get(asString(row.actor_id)) ?? 'System',
    action: asString(row.action),
    entityType: asString(row.entity_type),
    entityId: nullableString(row.entity_id),
    detail: row.detail,
    createdAt: asString(row.created_at),
  }))
}

