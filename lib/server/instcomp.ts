import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { compareInstruments, type CompareScale } from '@/lib/instcomp/compare'
import type { InstCompAnalyte, InstCompInstrument, InstCompSample, InstCompStatus, InstCompStudy, InstCompWorkspace } from '@/lib/instcomp/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

export const INSTCOMP_ATTACHMENT_ENTITY = 'instcomp-study'

function fail(error: { message: string } | null, message = 'Instrument comparison database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null)
const clean = (value: string | null | undefined) => value?.trim() || null

function assertStaff(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

function instrumentLabel(row: RecordRow | undefined) {
  if (!row) return ''
  const code = asString(row.code)
  const name = asString(row.name)
  return code && name ? `${code} · ${name}` : code || name
}

export async function getInstCompWorkspace(actor: BmActor): Promise<InstCompWorkspace> {
  assertStaff(actor)
  const admin = getAdminClient()
  const [{ data: studyRows, error: studyError }, { data: sampleRows, error: sampleError }, { data: instrumentRows, error: instrumentError }, { data: analyteRows, error: analyteError }] = await Promise.all([
    admin.from('instcomp_studies').select('*').order('created_at', { ascending: false }),
    admin.from('instcomp_samples').select('*').order('row_no'),
    admin.from('iqc_instruments').select('id,code,name,is_active').order('code'),
    admin.from('iqc_analytes').select('id,code,name,scale,unit,data_type,is_active').eq('data_type', 'quantitative').order('code'),
  ])
  fail(studyError)
  fail(sampleError)
  fail(instrumentError)
  fail(analyteError)

  const instruments = (instrumentRows ?? []) as RecordRow[]
  const instrumentById = new Map(instruments.map((row) => [asString(row.id), row]))
  const studies = (studyRows ?? []) as RecordRow[]
  const userIds = [...new Set(studies.flatMap((row) => [row.created_by, row.reviewed_by, row.approved_by]).map(asString).filter(Boolean))]
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data, error } = await admin.from('nipt_users').select('id,display_name').in('id', userIds)
    fail(error)
    for (const row of (data ?? []) as RecordRow[]) names.set(asString(row.id), asString(row.display_name))
  }
  const samplesByStudy = new Map<string, InstCompSample[]>()
  for (const row of (sampleRows ?? []) as RecordRow[]) {
    const studyId = asString(row.study_id)
    samplesByStudy.set(studyId, [...(samplesByStudy.get(studyId) ?? []), {
      id: asString(row.id),
      rowNo: Number(row.row_no),
      sampleLabel: nullableString(row.sample_label),
      referenceRaw: nullableString(row.reference_raw),
      candidateRaw: nullableString(row.candidate_raw),
      note: nullableString(row.note),
    }])
  }

  return {
    studies: studies.map((row): InstCompStudy => ({
      id: asString(row.id),
      title: asString(row.title),
      testName: asString(row.test_name),
      analyteId: nullableString(row.analyte_id),
      scale: asString(row.scale) === 'linear' ? 'linear' : 'log10',
      unit: nullableString(row.unit),
      referenceInstrumentId: nullableString(row.reference_instrument_id),
      referenceLabel: clean(nullableString(row.reference_label)) ?? instrumentLabel(instrumentById.get(asString(row.reference_instrument_id))),
      candidateInstrumentId: nullableString(row.candidate_instrument_id),
      candidateLabel: clean(nullableString(row.candidate_label)) ?? instrumentLabel(instrumentById.get(asString(row.candidate_instrument_id))),
      biasLimit: Number(row.bias_limit),
      pairLimit: Number(row.pair_limit),
      minPairs: Number(row.min_pairs),
      status: asString(row.status) as InstCompStatus,
      conclusion: nullableString(row.conclusion),
      performedOn: nullableString(row.performed_on),
      createdByName: names.get(asString(row.created_by)) ?? null,
      reviewedByName: names.get(asString(row.reviewed_by)) ?? null,
      reviewedAt: nullableString(row.reviewed_at),
      approvedByName: names.get(asString(row.approved_by)) ?? null,
      approvedAt: nullableString(row.approved_at),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      samples: samplesByStudy.get(asString(row.id)) ?? [],
    })),
    instruments: instruments.map((row): InstCompInstrument => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name), isActive: Boolean(row.is_active) })),
    analytes: ((analyteRows ?? []) as RecordRow[])
      .filter((row) => row.is_active !== false)
      .map((row): InstCompAnalyte => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name), scale: asString(row.scale) === 'log10' ? 'log10' : 'linear', unit: nullableString(row.unit) })),
  }
}

export interface InstCompStudyInput {
  title: string
  testName: string
  analyteId?: string | null
  scale: CompareScale
  unit?: string | null
  referenceInstrumentId?: string | null
  referenceLabel?: string | null
  candidateInstrumentId?: string | null
  candidateLabel?: string | null
  biasLimit: number
  pairLimit: number
  minPairs: number
  performedOn?: string | null
}

function studyColumns(input: InstCompStudyInput) {
  if (!input.referenceInstrumentId && !clean(input.referenceLabel)) throw new HttpError(400, 'ต้องระบุเครื่องอ้างอิง (เครื่องเดิม)')
  if (!input.candidateInstrumentId && !clean(input.candidateLabel)) throw new HttpError(400, 'ต้องระบุเครื่องที่ประเมิน (เครื่องใหม่)')
  if (input.referenceInstrumentId && input.referenceInstrumentId === input.candidateInstrumentId) throw new HttpError(400, 'เครื่องอ้างอิงกับเครื่องที่ประเมินต้องเป็นคนละเครื่อง')
  return {
    title: input.title.trim(),
    test_name: input.testName.trim(),
    analyte_id: input.analyteId || null,
    scale: input.scale,
    unit: clean(input.unit),
    reference_instrument_id: input.referenceInstrumentId || null,
    reference_label: clean(input.referenceLabel),
    candidate_instrument_id: input.candidateInstrumentId || null,
    candidate_label: clean(input.candidateLabel),
    bias_limit: input.biasLimit,
    pair_limit: input.pairLimit,
    min_pairs: input.minPairs,
    performed_on: input.performedOn || null,
  }
}

async function loadStudy(id: string) {
  const { data, error } = await getAdminClient().from('instcomp_studies').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการเปรียบเทียบเครื่อง')
  return data as RecordRow
}

function assertEditable(study: RecordRow) {
  if (asString(study.status) === 'approved') throw new HttpError(409, 'รายการนี้อนุมัติแล้ว แก้ไขไม่ได้')
}

export async function createInstCompStudy(input: InstCompStudyInput, actor: BmActor) {
  assertStaff(actor)
  const { data, error } = await getAdminClient()
    .from('instcomp_studies')
    .insert({ ...studyColumns(input), created_by: actor.id })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'instcomp.create', 'instcomp', id, { title: input.title, testName: input.testName })
  return id
}

export interface InstCompUpdateInput extends Partial<InstCompStudyInput> {
  status?: InstCompStatus
  conclusion?: string | null
  samples?: { sampleLabel?: string | null; referenceRaw?: string | null; candidateRaw?: string | null; note?: string | null }[]
}

export async function updateInstCompStudy(id: string, patch: InstCompUpdateInput, actor: BmActor) {
  assertStaff(actor)
  const admin = getAdminClient()
  const study = await loadStudy(id)
  const nextStatus = patch.status
  const statusOnly = nextStatus === 'rejected' || (nextStatus === 'in-progress' && asString(study.status) === 'approved')
  if (!statusOnly) assertEditable(study)

  const update: RecordRow = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) {
    const merged = {
      title: patch.title,
      testName: patch.testName ?? asString(study.test_name),
      analyteId: patch.analyteId !== undefined ? patch.analyteId : nullableString(study.analyte_id),
      scale: patch.scale ?? (asString(study.scale) as CompareScale),
      unit: patch.unit !== undefined ? patch.unit : nullableString(study.unit),
      referenceInstrumentId: patch.referenceInstrumentId !== undefined ? patch.referenceInstrumentId : nullableString(study.reference_instrument_id),
      referenceLabel: patch.referenceLabel !== undefined ? patch.referenceLabel : nullableString(study.reference_label),
      candidateInstrumentId: patch.candidateInstrumentId !== undefined ? patch.candidateInstrumentId : nullableString(study.candidate_instrument_id),
      candidateLabel: patch.candidateLabel !== undefined ? patch.candidateLabel : nullableString(study.candidate_label),
      biasLimit: patch.biasLimit ?? Number(study.bias_limit),
      pairLimit: patch.pairLimit ?? Number(study.pair_limit),
      minPairs: patch.minPairs ?? Number(study.min_pairs),
      performedOn: patch.performedOn !== undefined ? patch.performedOn : nullableString(study.performed_on),
    }
    Object.assign(update, studyColumns(merged))
  }
  if (patch.conclusion !== undefined) update.conclusion = clean(patch.conclusion)

  if (patch.samples) {
    const { error: deleteError } = await admin.from('instcomp_samples').delete().eq('study_id', id)
    fail(deleteError)
    const rows = patch.samples
      .filter((row) => clean(row.sampleLabel) || clean(row.referenceRaw) || clean(row.candidateRaw))
      .map((row, index) => ({
        study_id: id,
        row_no: index + 1,
        sample_label: clean(row.sampleLabel),
        reference_raw: clean(row.referenceRaw),
        candidate_raw: clean(row.candidateRaw),
        note: clean(row.note),
      }))
    if (rows.length) {
      const { error: insertError } = await admin.from('instcomp_samples').insert(rows)
      fail(insertError)
    }
    if (asString(study.status) === 'draft' && !nextStatus) update.status = 'in-progress'
  }

  if (nextStatus) {
    if (nextStatus === 'passed' || nextStatus === 'approved') {
      const { data: sampleRows, error } = await admin.from('instcomp_samples').select('row_no,sample_label,reference_raw,candidate_raw').eq('study_id', id).order('row_no')
      fail(error)
      const scale = (update.scale ?? study.scale) as CompareScale
      const { summary } = compareInstruments(((sampleRows ?? []) as RecordRow[]).map((row) => ({
        rowNo: Number(row.row_no),
        sampleLabel: nullableString(row.sample_label),
        referenceRaw: nullableString(row.reference_raw),
        candidateRaw: nullableString(row.candidate_raw),
      })), {
        scale: scale === 'linear' ? 'linear' : 'log10',
        biasLimit: Number(update.bias_limit ?? study.bias_limit),
        pairLimit: Number(update.pair_limit ?? study.pair_limit),
        minPairs: Number(update.min_pairs ?? study.min_pairs),
      })
      if (summary.verdict !== 'passed') throw new HttpError(409, `ยังไม่ผ่านเกณฑ์: ${summary.reasons.join(' · ')}`)
    }
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      assertAdmin(actor)
      update.approved_by = actor.id
      update.approved_at = new Date().toISOString()
    }
    if (nextStatus === 'passed' || nextStatus === 'failed') {
      update.reviewed_by = actor.id
      update.reviewed_at = new Date().toISOString()
    }
    if (nextStatus === 'in-progress') {
      update.approved_by = null
      update.approved_at = null
    }
    update.status = nextStatus
  }

  const { error } = await admin.from('instcomp_studies').update(update).eq('id', id)
  fail(error)
  await writeAudit(actor, 'instcomp.update', 'instcomp', id, {
    status: nextStatus ?? null,
    sampleCount: patch.samples?.length ?? null,
    fields: Object.keys(patch).filter((key) => key !== 'samples'),
  })
}

export async function deleteInstCompStudy(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const study = await loadStudy(id)
  const { count, error: attachmentError } = await admin
    .from('bm_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'instcomp')
    .eq('entity_type', INSTCOMP_ATTACHMENT_ENTITY)
    .eq('entity_id', id)
  fail(attachmentError)
  if ((count ?? 0) > 0) throw new HttpError(409, 'ลบไฟล์แนบออกก่อนจึงจะลบรายการได้')
  const { error } = await admin.from('instcomp_studies').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'instcomp.delete', 'instcomp', id, { title: asString(study.title), status: asString(study.status) })
}
