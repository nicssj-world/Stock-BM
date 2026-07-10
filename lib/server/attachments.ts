import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'bm-quality'

export type AttachmentModule = 'iqc' | 'eqa' | 'stock' | 'env' | 'lotverif' | 'hpv'

export interface AttachmentRecord {
  id: string
  module: AttachmentModule
  entityType: string
  entityId: string | null
  kind: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  uploadedBy: string
  createdAt: string
}

type RecordRow = Record<string, unknown>

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function fail(error: { message: string } | null, message = 'Attachment operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function mapRow(row: RecordRow): AttachmentRecord {
  return {
    id: asString(row.id),
    module: asString(row.module) as AttachmentModule,
    entityType: asString(row.entity_type),
    entityId: nullableString(row.entity_id),
    kind: asString(row.kind),
    fileName: asString(row.file_name),
    contentType: nullableString(row.content_type),
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    uploadedBy: asString(row.uploaded_by),
    createdAt: asString(row.created_at),
  }
}

function safeName(name: string) {
  const trimmed = name.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_')
  return trimmed.slice(-120) || 'file'
}

export async function uploadAttachment(
  input: { module: AttachmentModule; entityType: string; entityId: string | null; kind: string; file: File },
  actor: BmActor,
): Promise<AttachmentRecord> {
  const admin = getAdminClient()
  const path = `${input.module}/${input.entityType}/${input.entityId ?? 'misc'}/${crypto.randomUUID()}-${safeName(input.file.name)}`
  const bytes = new Uint8Array(await input.file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: input.file.type || undefined, upsert: false })
  if (uploadError) throw new HttpError(400, uploadError.message || 'File upload failed')

  const { data, error } = await admin
    .from('bm_attachments')
    .insert({
      module: input.module,
      entity_type: input.entityType,
      entity_id: input.entityId,
      kind: input.kind,
      storage_path: path,
      file_name: input.file.name,
      content_type: input.file.type || null,
      size_bytes: input.file.size,
      uploaded_by: actor.id,
    })
    .select('*')
    .single()
  if (error) {
    await admin.storage.from(BUCKET).remove([path])
    throw new HttpError(400, error.message || 'Attachment metadata failed')
  }

  const record = mapRow(data as RecordRow)
  await writeAudit(actor, 'attachment.upload', `${input.module}-attachment`, record.id, {
    entityType: record.entityType,
    entityId: record.entityId,
    kind: record.kind,
    fileName: record.fileName,
  })
  return record
}

export async function listAttachments(
  module: AttachmentModule,
  entityType: string,
  entityId: string | null,
): Promise<AttachmentRecord[]> {
  const admin = getAdminClient()
  let query = admin.from('bm_attachments').select('*').eq('module', module).eq('entity_type', entityType)
  query = entityId ? query.eq('entity_id', entityId) : query.is('entity_id', null)
  const { data, error } = await query.order('created_at', { ascending: false })
  fail(error)
  return ((data ?? []) as RecordRow[]).map(mapRow)
}

async function getAttachmentRow(id: string) {
  const { data, error } = await getAdminClient().from('bm_attachments').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Attachment not found')
  return data as RecordRow
}

export async function signedUrl(id: string): Promise<string> {
  const row = await getAttachmentRow(id)
  const { data, error } = await getAdminClient().storage.from(BUCKET).createSignedUrl(asString(row.storage_path), 120)
  if (error || !data) throw new HttpError(400, error?.message || 'Could not create download link')
  return data.signedUrl
}

export async function deleteAttachment(id: string, actor: BmActor): Promise<void> {
  const admin = getAdminClient()
  const row = await getAttachmentRow(id)
  const module = asString(row.module)
  if (actor.role !== 'Admin' && module !== 'iqc') throw new HttpError(403, 'Admin permission required to delete attachment')
  await admin.storage.from(BUCKET).remove([asString(row.storage_path)])
  const { error } = await admin.from('bm_attachments').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'attachment.delete', `${module}-attachment`, id, {
    fileName: asString(row.file_name),
  })
}
