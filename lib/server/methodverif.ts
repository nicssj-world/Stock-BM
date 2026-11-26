import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { evaluateStudy } from '@/lib/methodverif/evaluate'
import type { CreateMethodVerifInput, UpdateMethodVerifInput } from '@/lib/methodverif/schema'
import {
  defaultComparison,
  defaultLinearity,
  defaultLod,
  defaultPrecision,
  defaultQualitative,
  METHODVERIF_SECTIONS,
  type ComparisonData,
  type LinearityData,
  type LodData,
  type MethodVerifSection,
  type MethodVerifStatus,
  type MethodVerifStudy,
  type MethodVerifWorkspace,
  type PrecisionData,
  type QualitativeData,
} from '@/lib/methodverif/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

export const METHODVERIF_ATTACHMENT_ENTITY = 'methodverif-study'

function fail(error: { message: string } | null, message = 'Method verification database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null)
const clean = (value: string | null | undefined) => value?.trim() || null
const asObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordRow) : {})

function assertStaff(actor: BmActor) {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

function scaleOf(row: RecordRow) {
  return asString(row.scale) === 'linear' ? 'linear' as const : 'log10' as const
}

function precisionOf(value: unknown): PrecisionData {
  const data = asObject(value)
  const base = defaultPrecision()
  return {
    days: typeof data.days === 'number' ? data.days : base.days,
    replicates: typeof data.replicates === 'number' ? data.replicates : base.replicates,
    levels: Array.isArray(data.levels) ? (data.levels as PrecisionData['levels']) : [],
  }
}

function lodOf(value: unknown): LodData {
  const data = asObject(value)
  const base = defaultLod()
  return {
    claimedLod: typeof data.claimedLod === 'number' ? data.claimedLod : null,
    minReplicates: typeof data.minReplicates === 'number' ? data.minReplicates : base.minReplicates,
    minDetectPercent: typeof data.minDetectPercent === 'number' ? data.minDetectPercent : base.minDetectPercent,
    values: Array.isArray(data.values) ? (data.values as string[]) : [],
  }
}

function linearityOf(value: unknown, scale: 'linear' | 'log10'): LinearityData {
  const data = asObject(value)
  const base = defaultLinearity(scale)
  return {
    limit: typeof data.limit === 'number' ? data.limit : base.limit,
    points: Array.isArray(data.points) ? (data.points as LinearityData['points']) : [],
  }
}

function comparisonOf(value: unknown, scale: 'linear' | 'log10'): ComparisonData {
  const data = asObject(value)
  const base = defaultComparison(scale)
  return {
    referenceLabel: typeof data.referenceLabel === 'string' ? data.referenceLabel : base.referenceLabel,
    biasLimit: typeof data.biasLimit === 'number' ? data.biasLimit : base.biasLimit,
    pairLimit: typeof data.pairLimit === 'number' ? data.pairLimit : base.pairLimit,
    minPairs: typeof data.minPairs === 'number' ? data.minPairs : base.minPairs,
    samples: Array.isArray(data.samples) ? (data.samples as ComparisonData['samples']) : [],
  }
}

function qualitativeOf(value: unknown): QualitativeData {
  const data = asObject(value)
  const base = defaultQualitative()
  const num = (key: keyof QualitativeData, fallback: number) => (typeof data[key] === 'number' ? (data[key] as number) : fallback)
  return {
    referenceLabel: typeof data.referenceLabel === 'string' ? data.referenceLabel : base.referenceLabel,
    minSamples: num('minSamples', base.minSamples),
    minAgreementPercent: num('minAgreementPercent', base.minAgreementPercent),
    minReproducibilityPercent: num('minReproducibilityPercent', base.minReproducibilityPercent),
    samples: Array.isArray(data.samples) ? (data.samples as QualitativeData['samples']) : [],
    reproducibility: Array.isArray(data.reproducibility) ? (data.reproducibility as QualitativeData['reproducibility']) : [],
  }
}

async function loadContext() {
  const admin = getAdminClient()
  const [{ data: instrumentRows, error: instrumentError }, { data: analyteRows, error: analyteError }] = await Promise.all([
    admin.from('iqc_instruments').select('id,code,name,is_active').order('code'),
    admin.from('iqc_analytes').select('id,code,scale,unit,data_type,is_active').eq('data_type', 'quantitative').order('code'),
  ])
  fail(instrumentError)
  fail(analyteError)
  return {
    instruments: ((instrumentRows ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name), isActive: Boolean(row.is_active) })),
    analytes: ((analyteRows ?? []) as RecordRow[]).filter((row) => row.is_active !== false).map((row) => ({ id: asString(row.id), code: asString(row.code), scale: asString(row.scale) === 'log10' ? 'log10' as const : 'linear' as const, unit: nullableString(row.unit) })),
  }
}

async function mapStudies(rows: RecordRow[], context: Awaited<ReturnType<typeof loadContext>>): Promise<MethodVerifStudy[]> {
  const userIds = [...new Set(rows.flatMap((row) => [row.created_by, row.reviewed_by, row.approved_by]).map(asString).filter(Boolean))]
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', userIds)
    fail(error)
    for (const row of (data ?? []) as RecordRow[]) names.set(asString(row.id), asString(row.display_name))
  }
  const instrumentById = new Map(context.instruments.map((item) => [item.id, item]))
  return rows.map((row) => {
    const scale = scaleOf(row)
    const instrument = instrumentById.get(asString(row.instrument_id))
    return {
      id: asString(row.id),
      title: asString(row.title),
      testName: asString(row.test_name),
      analyteId: nullableString(row.analyte_id),
      instrumentId: asString(row.instrument_id),
      instrumentLabel: instrument ? `${instrument.code} · ${instrument.name}` : asString(row.instrument_id),
      scale,
      unit: nullableString(row.unit),
      requiredSections: (Array.isArray(row.required_sections) ? row.required_sections : METHODVERIF_SECTIONS).filter((section): section is MethodVerifSection => METHODVERIF_SECTIONS.includes(section as MethodVerifSection)),
      precision: precisionOf(row.precision_data),
      lod: lodOf(row.lod_data),
      linearity: linearityOf(row.linearity_data, scale),
      comparison: comparisonOf(row.comparison_data, scale),
      qualitative: qualitativeOf(row.qualitative_data),
      status: asString(row.status) as MethodVerifStatus,
      conclusion: nullableString(row.conclusion),
      startedOn: nullableString(row.started_on),
      createdByName: names.get(asString(row.created_by)) ?? null,
      reviewedByName: names.get(asString(row.reviewed_by)) ?? null,
      reviewedAt: nullableString(row.reviewed_at),
      approvedByName: names.get(asString(row.approved_by)) ?? null,
      approvedAt: nullableString(row.approved_at),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    }
  })
}

export async function getMethodVerifWorkspace(actor: BmActor): Promise<MethodVerifWorkspace> {
  assertStaff(actor)
  const [context, { data, error }] = await Promise.all([
    loadContext(),
    getAdminClient().from('methodverif_studies').select('*').order('created_at', { ascending: false }),
  ])
  fail(error)
  return { ...context, studies: await mapStudies((data ?? []) as RecordRow[], context) }
}

export async function getMethodVerifStudy(id: string, actor: BmActor): Promise<MethodVerifStudy> {
  assertStaff(actor)
  const [context, { data, error }] = await Promise.all([
    loadContext(),
    getAdminClient().from('methodverif_studies').select('*').eq('id', id).maybeSingle(),
  ])
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบรายการ Method verification')
  return (await mapStudies([data as RecordRow], context))[0]
}

export async function createMethodVerifStudy(input: CreateMethodVerifInput, actor: BmActor) {
  assertStaff(actor)
  const { data, error } = await getAdminClient()
    .from('methodverif_studies')
    .insert({
      title: input.title.trim(),
      test_name: input.testName.trim(),
      analyte_id: input.analyteId || null,
      instrument_id: input.instrumentId,
      scale: input.scale,
      unit: clean(input.unit),
      required_sections: input.requiredSections,
      precision_data: defaultPrecision(),
      lod_data: defaultLod(),
      linearity_data: defaultLinearity(input.scale),
      comparison_data: { ...defaultComparison(input.scale), referenceLabel: input.referenceLabel?.trim() ?? '' },
      qualitative_data: { ...defaultQualitative(), referenceLabel: input.referenceLabel?.trim() ?? '' },
      started_on: input.startedOn || null,
      created_by: actor.id,
    })
    .select('id')
    .single()
  fail(error)
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'methodverif.create', 'methodverif', id, { title: input.title, testName: input.testName, instrumentId: input.instrumentId })
  return id
}

export async function updateMethodVerifStudy(id: string, patch: UpdateMethodVerifInput, actor: BmActor) {
  assertStaff(actor)
  const admin = getAdminClient()
  const current = await getMethodVerifStudy(id, actor)
  const reopening = patch.status === 'in-progress' && (current.status === 'approved' || current.status === 'rejected')
  if (current.status === 'approved' && !reopening) throw new HttpError(409, 'รายการนี้อนุมัติแล้ว แก้ไขไม่ได้')

  const update: RecordRow = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.testName !== undefined) update.test_name = patch.testName.trim()
  if (patch.analyteId !== undefined) update.analyte_id = patch.analyteId || null
  if (patch.instrumentId !== undefined) update.instrument_id = patch.instrumentId
  if (patch.scale !== undefined) update.scale = patch.scale
  if (patch.unit !== undefined) update.unit = clean(patch.unit)
  if (patch.requiredSections !== undefined) update.required_sections = patch.requiredSections
  if (patch.startedOn !== undefined) update.started_on = patch.startedOn || null
  if (patch.precision !== undefined) update.precision_data = patch.precision
  if (patch.lod !== undefined) update.lod_data = patch.lod
  if (patch.linearity !== undefined) update.linearity_data = patch.linearity
  if (patch.comparison !== undefined) update.comparison_data = patch.comparison
  if (patch.qualitative !== undefined) update.qualitative_data = patch.qualitative
  if (patch.conclusion !== undefined) update.conclusion = clean(patch.conclusion)
  const dataChanged = patch.precision !== undefined || patch.lod !== undefined || patch.linearity !== undefined || patch.comparison !== undefined || patch.qualitative !== undefined
  if (dataChanged && current.status === 'draft' && !patch.status) update.status = 'in-progress'

  if (patch.status) {
    if (patch.status === 'passed' || patch.status === 'approved') {
      const evaluation = evaluateStudy({
        scale: patch.scale ?? current.scale,
        requiredSections: patch.requiredSections ?? current.requiredSections,
        precision: patch.precision ?? current.precision,
        lod: patch.lod ?? current.lod,
        linearity: patch.linearity ?? current.linearity,
        comparison: patch.comparison ?? current.comparison,
        qualitative: patch.qualitative ?? current.qualitative,
      })
      if (evaluation.overall !== 'passed') throw new HttpError(409, `ยังไม่ผ่านเกณฑ์: ${evaluation.reasons.slice(0, 4).join(' · ')}`)
    }
    if (patch.status === 'approved' || patch.status === 'rejected') {
      assertAdmin(actor)
      update.approved_by = actor.id
      update.approved_at = new Date().toISOString()
    }
    if (patch.status === 'passed' || patch.status === 'failed') {
      update.reviewed_by = actor.id
      update.reviewed_at = new Date().toISOString()
    }
    if (reopening) {
      assertAdmin(actor)
      update.approved_by = null
      update.approved_at = null
    }
    update.status = patch.status
  }

  const { error } = await admin.from('methodverif_studies').update(update).eq('id', id)
  fail(error)
  await writeAudit(actor, 'methodverif.update', 'methodverif', id, {
    status: patch.status ?? null,
    fields: Object.keys(patch),
  })
}

export async function deleteMethodVerifStudy(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const study = await getMethodVerifStudy(id, actor)
  if (study.status === 'approved') throw new HttpError(409, 'รายการที่อนุมัติแล้วลบไม่ได้')
  const { count, error: attachmentError } = await admin
    .from('bm_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'methodverif')
    .eq('entity_type', METHODVERIF_ATTACHMENT_ENTITY)
    .eq('entity_id', id)
  fail(attachmentError)
  if ((count ?? 0) > 0) throw new HttpError(409, 'ลบไฟล์แนบออกก่อนจึงจะลบรายการได้')
  const { error } = await admin.from('methodverif_studies').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'methodverif.delete', 'methodverif', id, { title: study.title, status: study.status })
}
