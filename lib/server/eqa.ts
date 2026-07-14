import 'server-only'

import type {
  EqaCorrectiveAction,
  EqaOutcome,
  EqaProvider,
  EqaResult,
  EqaRound,
  EqaRoundStatus,
  EqaScheme,
  EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_DUE_SOON_DAYS } from '@/lib/eqa/types'
import type { BmActor } from '@/lib/bm/types'
import { daysUntil, todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'EQA database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}
function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}
function nullableNumber(value: unknown) {
  return value == null || value === '' ? null : Number(value)
}
function clean(value: string | null | undefined) {
  return value?.trim() || null
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

const OPEN_STATUSES = new Set<EqaRoundStatus>(['scheduled', 'received'])

export async function getEqaWorkspace(actor: BmActor): Promise<EqaWorkspace> {
  void actor
  const admin = getAdminClient()
  const [
    { data: providerData, error: providerError },
    { data: schemeData, error: schemeError },
    { data: roundData, error: roundError },
    { data: resultData, error: resultError },
    { data: caData, error: caError },
    { data: iqcAnalyteData, error: iqcAnalyteError },
  ] = await Promise.all([
    admin.from('eqa_providers').select('*').order('name'),
    admin.from('eqa_schemes').select('*').order('name'),
    admin.from('eqa_rounds').select('*').order('result_due_date', { ascending: true, nullsFirst: false }),
    admin.from('eqa_results').select('*'),
    admin.from('eqa_corrective_actions').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('iqc_analytes').select('id,code,name').eq('is_active', true).order('code'),
  ])
  fail(providerError)
  fail(schemeError)
  fail(roundError)
  fail(resultError)
  fail(caError)
  fail(iqcAnalyteError)

  const providers: EqaProvider[] = ((providerData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), name: asString(row.name), isActive: Boolean(row.is_active) }))
  const providerMap = new Map(providers.map((p) => [p.id, p]))

  const schemes: EqaScheme[] = ((schemeData ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    providerId: asString(row.provider_id),
    providerName: providerMap.get(asString(row.provider_id))?.name ?? '-',
    name: asString(row.name),
    code: nullableString(row.code),
    analyteScope: nullableString(row.analyte_scope),
    roundsPerYear: row.rounds_per_year == null ? null : Number(row.rounds_per_year),
    isActive: Boolean(row.is_active),
  }))
  const schemeMap = new Map(schemes.map((s) => [s.id, s]))

  const resultsByRound = new Map<string, EqaResult[]>()
  for (const row of (resultData ?? []) as RecordRow[]) {
    const roundId = asString(row.round_id)
    const result: EqaResult = {
      id: asString(row.id),
      roundId,
      analyte: asString(row.analyte),
      submittedValue: nullableString(row.submitted_value),
      evaluationScore: nullableNumber(row.evaluation_score),
      outcome: asString(row.outcome) as EqaOutcome,
      iqcAnalyteId: nullableString(row.iqc_analyte_id),
      assignedValue: nullableNumber(row.assigned_value),
    }
    resultsByRound.set(roundId, [...(resultsByRound.get(roundId) ?? []), result])
  }

  const today = todayBangkok()
  const rounds: EqaRound[] = ((roundData ?? []) as RecordRow[]).map((row) => {
    const scheme = schemeMap.get(asString(row.scheme_id))
    const status = asString(row.status) as EqaRoundStatus
    const due = nullableString(row.result_due_date)
    let dueInDays: number | null = null
    let reminder: 'overdue' | 'due-soon' | null = null
    if (due && OPEN_STATUSES.has(status)) {
      dueInDays = daysUntil(due, today)
      if (dueInDays < 0) reminder = 'overdue'
      else if (dueInDays <= EQA_DUE_SOON_DAYS) reminder = 'due-soon'
    }
    return {
      id: asString(row.id),
      schemeId: asString(row.scheme_id),
      schemeName: scheme?.name ?? '-',
      providerName: scheme?.providerName ?? '-',
      roundLabel: asString(row.round_label),
      sampleReceivedDate: nullableString(row.sample_received_date),
      resultDueDate: due,
      submissionDate: nullableString(row.submission_date),
      status,
      note: nullableString(row.note),
      results: resultsByRound.get(asString(row.id)) ?? [],
      dueInDays,
      reminder,
    }
  })
  const roundMap = new Map(rounds.map((r) => [r.id, r]))

  const caRows = (caData ?? []) as RecordRow[]
  const nameMap = await getNameMap(caRows.flatMap((r) => [asString(r.created_by), asString(r.closed_by)]))
  const correctiveActions: EqaCorrectiveAction[] = caRows.map((row) => ({
    id: asString(row.id),
    roundId: asString(row.round_id),
    roundLabel: roundMap.get(asString(row.round_id))?.roundLabel ?? '-',
    problem: asString(row.problem),
    rootCause: nullableString(row.root_cause),
    actionTaken: nullableString(row.action_taken),
    status: asString(row.status) === 'closed' ? 'closed' : 'open',
    createdByName: nameMap.get(asString(row.created_by)) ?? null,
    createdAt: asString(row.created_at),
    closedByName: row.closed_by ? nameMap.get(asString(row.closed_by)) ?? null : null,
    closedAt: nullableString(row.closed_at),
  }))

  return {
    providers,
    schemes,
    rounds,
    correctiveActions,
    iqcAnalytes: ((iqcAnalyteData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name) })),
    summary: {
      schemeCount: schemes.filter((s) => s.isActive).length,
      overdue: rounds.filter((r) => r.reminder === 'overdue').length,
      dueSoon: rounds.filter((r) => r.reminder === 'due-soon').length,
      unacceptable: rounds.reduce((sum, r) => sum + r.results.filter((res) => res.outcome === 'unacceptable').length, 0),
      openCorrectiveActions: correctiveActions.filter((c) => c.status === 'open').length,
    },
  }
}

const EQA_ENTITY = { provider: 'eqa_providers', scheme: 'eqa_schemes' } as const

export async function setEqaEntityActive(entity: keyof typeof EQA_ENTITY, id: string, isActive: boolean, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().from(EQA_ENTITY[entity]).update({ is_active: isActive }).eq('id', id)
  fail(error)
  await writeAudit(actor, `eqa.${entity}.setActive`, `eqa-${entity}`, id, { isActive })
  return getEqaWorkspace(actor)
}

export async function createProvider(input: { name: string }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_providers').insert({ name: input.name.trim(), created_by: actor.id }).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.provider.create', 'eqa-provider', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function deleteProvider(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: schemeRows, error: schemeError } = await admin.from('eqa_schemes').select('id').eq('provider_id', id).limit(1)
  fail(schemeError)
  if ((schemeRows ?? []).length > 0) throw new HttpError(409, 'ลบ provider ไม่ได้ เพราะมี scheme ผูกอยู่')
  const { error } = await admin.from('eqa_providers').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.provider.delete', 'eqa-provider', id, {})
  return getEqaWorkspace(actor)
}

export async function createScheme(input: { providerId: string; name: string; code?: string | null; analyteScope?: string | null; roundsPerYear?: number | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_schemes').insert({
    provider_id: input.providerId,
    name: input.name.trim(),
    code: clean(input.code),
    analyte_scope: clean(input.analyteScope),
    rounds_per_year: input.roundsPerYear ?? null,
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.scheme.create', 'eqa-scheme', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function updateProvider(id: string, input: { name: string }, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().from('eqa_providers').update({ name: input.name.trim() }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.provider.update', 'eqa-provider', id, input)
  return getEqaWorkspace(actor)
}

export async function updateScheme(id: string, input: { providerId: string; name: string; code?: string | null; analyteScope?: string | null; roundsPerYear?: number | null }, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().from('eqa_schemes').update({ provider_id: input.providerId, name: input.name.trim(), code: clean(input.code), analyte_scope: clean(input.analyteScope), rounds_per_year: input.roundsPerYear ?? null }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.scheme.update', 'eqa-scheme', id, input)
  return getEqaWorkspace(actor)
}

export async function deleteScheme(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { count, error: countError } = await admin.from('eqa_rounds').select('id', { count: 'exact', head: true }).eq('scheme_id', id)
  fail(countError)
  if (count) throw new HttpError(409, 'ลบ scheme ไม่ได้ เพราะมี round ผูกอยู่')
  const { error } = await admin.from('eqa_schemes').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.scheme.delete', 'eqa-scheme', id, {})
  return getEqaWorkspace(actor)
}

export async function createRound(input: { schemeId: string; roundLabel: string; sampleReceivedDate?: string | null; resultDueDate?: string | null; note?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_rounds').insert({
    scheme_id: input.schemeId,
    round_label: input.roundLabel.trim(),
    sample_received_date: input.sampleReceivedDate || null,
    result_due_date: input.resultDueDate || null,
    note: clean(input.note),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.round.create', 'eqa-round', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function updateRound(id: string, input: { roundLabel?: string; status?: EqaRoundStatus; submissionDate?: string | null; sampleReceivedDate?: string | null; resultDueDate?: string | null; note?: string | null }, actor: BmActor) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.status !== undefined) updates.status = input.status
  if (input.roundLabel !== undefined) updates.round_label = input.roundLabel.trim()
  if (input.submissionDate !== undefined) updates.submission_date = input.submissionDate || null
  if (input.submissionDate === undefined && (input.status === 'submitted' || input.status === 'evaluated')) {
    const { data, error } = await getAdminClient().from('eqa_rounds').select('submission_date').eq('id', id).maybeSingle()
    fail(error)
    if (!nullableString((data as RecordRow | null)?.submission_date)) updates.submission_date = todayBangkok()
  }
  if (input.sampleReceivedDate !== undefined) updates.sample_received_date = input.sampleReceivedDate || null
  if (input.resultDueDate !== undefined) updates.result_due_date = input.resultDueDate || null
  if (input.note !== undefined) updates.note = clean(input.note)
  const { error } = await getAdminClient().from('eqa_rounds').update(updates).eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.round.update', 'eqa-round', id, input)
  return getEqaWorkspace(actor)
}

export async function deleteRound(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { count, error: countError } = await admin.from('eqa_corrective_actions').select('id', { count: 'exact', head: true }).eq('round_id', id)
  fail(countError)
  if (count) throw new HttpError(409, 'ลบ round ไม่ได้ เพราะมี corrective action ผูกอยู่')
  const { error } = await admin.from('eqa_rounds').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.round.delete', 'eqa-round', id, {})
  return getEqaWorkspace(actor)
}

export async function createResult(input: { roundId: string; analyte: string; submittedValue?: string | null; evaluationScore?: number | null; outcome: EqaOutcome; iqcAnalyteId?: string | null; assignedValue?: number | null }, actor: BmActor) {
  const { data, error } = await getAdminClient().from('eqa_results').insert({
    round_id: input.roundId,
    analyte: input.analyte.trim(),
    submitted_value: clean(input.submittedValue),
    evaluation_score: input.evaluationScore ?? null,
    outcome: input.outcome,
    iqc_analyte_id: input.iqcAnalyteId || null,
    assigned_value: input.assignedValue ?? null,
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.result.create', 'eqa-result', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function updateResult(id: string, input: { analyte: string; submittedValue?: string | null; evaluationScore?: number | null; outcome: EqaOutcome; iqcAnalyteId?: string | null; assignedValue?: number | null }, actor: BmActor) {
  const { data, error } = await getAdminClient().from('eqa_results').update({
    analyte: input.analyte.trim(),
    submitted_value: clean(input.submittedValue),
    evaluation_score: input.evaluationScore ?? null,
    outcome: input.outcome,
    iqc_analyte_id: input.iqcAnalyteId || null,
    assigned_value: input.assignedValue ?? null,
  }).eq('id', id).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.result.update', 'eqa-result', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function deleteResult(id: string, actor: BmActor) {
  const admin = getAdminClient()
  const { data: row, error: rowError } = await admin.from('eqa_results').select('id,round_id,analyte').eq('id', id).maybeSingle()
  fail(rowError)
  if (!row) throw new HttpError(404, 'EQA result not found')
  const { error } = await admin.from('eqa_results').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.result.delete', 'eqa-result', id, {
    roundId: asString((row as RecordRow).round_id),
    analyte: asString((row as RecordRow).analyte),
  })
  return getEqaWorkspace(actor)
}

export async function createEqaCorrectiveAction(input: { roundId: string; resultId?: string | null; problem: string; rootCause?: string | null; actionTaken?: string | null }, actor: BmActor) {
  if (!input.problem.trim()) throw new HttpError(400, 'Problem description is required')
  const { data, error } = await getAdminClient().from('eqa_corrective_actions').insert({
    round_id: input.roundId,
    result_id: input.resultId || null,
    problem: input.problem.trim(),
    root_cause: clean(input.rootCause),
    action_taken: clean(input.actionTaken),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'eqa.correctiveAction.create', 'eqa-corrective-action', asString((data as RecordRow).id), input)
  return getEqaWorkspace(actor)
}

export async function closeEqaCorrectiveAction(id: string, input: { rootCause?: string | null; actionTaken?: string | null }, actor: BmActor) {
  const { error } = await getAdminClient().from('eqa_corrective_actions').update({
    root_cause: clean(input.rootCause),
    action_taken: clean(input.actionTaken),
    status: 'closed',
    closed_by: actor.id,
    closed_at: new Date().toISOString(),
  }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'eqa.correctiveAction.close', 'eqa-corrective-action', id, input)
  return getEqaWorkspace(actor)
}
