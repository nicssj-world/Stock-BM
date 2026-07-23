import 'server-only'

import type {
  EqaAnnualPlan,
  EqaAnnualSummary,
  EqaApprovalRole,
  EqaApproverAssignment,
  EqaAssignedApprovalRole,
  EqaCondition,
  EqaCorrectiveAction,
  EqaDocumentApproval,
  EqaDocumentState,
  EqaDocumentType,
  EqaOutcome,
  EqaPlanItem,
  EqaPlanOccurrence,
  EqaProvider,
  EqaResult,
  EqaRound,
  EqaRoundStatus,
  EqaRoundSummaryOutcome,
  EqaScheme,
  EqaTemperatureCondition,
  EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_DUE_SOON_DAYS } from '@/lib/eqa/types'
import { annualPlanReadiness, annualSummaryReadiness, roundReceiptReadiness } from '@/lib/eqa/rules'
import type { BmActor } from '@/lib/bm/types'
import { daysUntil, todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

export interface EqaPlanItemInput {
  planId: string
  schemeId: string
  projectName: string
  providerName: string
  sampleSetName: string
  externalCode?: string | null
  testItem: string
  expectedRounds?: number | null
  maintenanceBudget?: boolean
  tor?: boolean
  price?: number | null
  evaluationCriteria?: string | null
  equipmentName?: string | null
  note?: string | null
  sortOrder?: number
  occurrences?: Array<{ plannedMonth: number; responsibleUserId?: string | null; responsibleCode: string; sortOrder?: number }>
}

export interface EqaRoundReceiptInput {
  planItemId: string
  externalSentDate?: string | null
  sampleReceivedDate?: string | null
  packageCondition?: EqaCondition | null
  packageNote?: string | null
  receivedTemperature?: EqaTemperatureCondition | null
  receivedTemperatureNote?: string | null
  sampleCondition?: EqaCondition | null
  sampleConditionNote?: string | null
  storageCondition?: EqaTemperatureCondition | null
  storageTemperatureC?: number | null
  storageNote?: string | null
  specimenType?: string | null
  receiverId?: string | null
  analystId?: string | null
  analysisDate?: string | null
  submissionDate?: string | null
  submissionMethod?: string | null
  otherDetails?: string | null
}

function fail(error: { message: string } | null, message = 'EQA database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
function asString(value: unknown) { return typeof value === 'string' ? value : '' }
function nullableString(value: unknown) { return typeof value === 'string' ? value : null }
function nullableNumber(value: unknown) { return value == null || value === '' ? null : Number(value) }
function clean(value: string | null | undefined) { return value?.trim() || null }
function assertAdmin(actor: BmActor) { if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required') }
function assertOperator(actor: BmActor) { if (actor.role === 'Assistant') throw new HttpError(403, 'EQA Staff or Admin permission required') }
function documentKey(documentType: EqaDocumentType, entityId: string) { return `${documentType}:${entityId}` }
function approvalKey(documentType: EqaDocumentType, entityId: string, revision: number) { return `${documentType}:${entityId}:${revision}` }

const OPEN_STATUSES = new Set<EqaRoundStatus>(['scheduled', 'received'])
const ASSIGNED_APPROVAL_ROLES: EqaAssignedApprovalRole[] = ['technical-manager', 'quality-manager', 'section-head', 'department-head']
const REQUIRED_APPROVALS: Record<EqaDocumentType, EqaApprovalRole[]> = {
  'annual-plan': ['technical-manager', 'quality-manager', 'section-head', 'department-head'],
  'round-receipt': ['analyst', 'technical-manager'],
  'annual-summary': ['technical-manager', 'quality-manager', 'section-head', 'department-head'],
}

function defaultDocumentState(documentType: EqaDocumentType, entityId: string): EqaDocumentState {
  return { documentType, entityId, revision: 1, status: 'draft' }
}

export async function getEqaWorkspace(actor: BmActor): Promise<EqaWorkspace> {
  assertOperator(actor)
  const admin = getAdminClient()
  const results = await Promise.all([
    admin.from('eqa_providers').select('*').order('name'),
    admin.from('eqa_schemes').select('*').order('name'),
    admin.from('eqa_annual_plans').select('*').order('plan_year', { ascending: false }),
    admin.from('eqa_plan_items').select('*').order('sort_order'),
    admin.from('eqa_plan_occurrences').select('*').order('planned_month').order('sort_order'),
    admin.from('eqa_rounds').select('*').order('result_due_date', { ascending: true, nullsFirst: false }),
    admin.from('eqa_results').select('*').order('created_at'),
    admin.from('eqa_corrective_actions').select('*').order('created_at', { ascending: false }).limit(500),
    admin.from('iqc_analytes').select('id,code,name').eq('is_active', true).order('code'),
    admin.from('bm_equipment_module_links').select('equipment_id,entity_id').eq('module', 'eqa').eq('entity_type', 'scheme'),
    admin.from('bm_equipment').select('id,code,name,status'),
    admin.from('nipt_users').select('id,display_name,is_active').order('display_name'),
    admin.from('eqa_approver_assignments').select('*'),
    admin.from('eqa_document_states').select('*'),
    admin.from('eqa_document_approvals').select('*').order('approved_at'),
  ])
  for (const result of results) fail(result.error)
  const [providerData, schemeData, planData, planItemData, occurrenceData, roundData, resultData, caData, iqcAnalyteData, equipmentLinkData, equipmentData, userData, assignmentData, stateData, approvalData] = results.map((result) => result.data ?? [])

  const userRows = userData as RecordRow[]
  const userNameMap = new Map(userRows.map((row) => [asString(row.id), asString(row.display_name)]))
  const users = userRows.filter((row) => Boolean(row.is_active)).map((row) => ({ id: asString(row.id), displayName: asString(row.display_name) }))

  const providers: EqaProvider[] = (providerData as RecordRow[]).map((row) => ({ id: asString(row.id), name: asString(row.name), isActive: Boolean(row.is_active) }))
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const equipmentById = new Map((equipmentData as RecordRow[]).map((row) => [asString(row.id), row]))
  const equipmentIdsByScheme = new Map<string, string[]>()
  for (const link of equipmentLinkData as RecordRow[]) {
    const schemeId = asString(link.entity_id)
    equipmentIdsByScheme.set(schemeId, [...(equipmentIdsByScheme.get(schemeId) ?? []), asString(link.equipment_id)])
  }
  const schemes: EqaScheme[] = (schemeData as RecordRow[]).map((row) => ({
    id: asString(row.id), providerId: asString(row.provider_id), providerName: providerMap.get(asString(row.provider_id))?.name ?? '-',
    name: asString(row.name), code: nullableString(row.code), analyteScope: nullableString(row.analyte_scope),
    roundsPerYear: nullableNumber(row.rounds_per_year), isActive: Boolean(row.is_active),
    equipment: (equipmentIdsByScheme.get(asString(row.id)) ?? []).flatMap((equipmentId) => {
      const equipment = equipmentById.get(equipmentId)
      return equipment ? [{ id: equipmentId, code: asString(equipment.code), name: asString(equipment.name), status: asString(equipment.status) as EqaScheme['equipment'][number]['status'] }] : []
    }),
  }))
  const schemeMap = new Map(schemes.map((scheme) => [scheme.id, scheme]))

  const states = new Map<string, EqaDocumentState>()
  for (const row of stateData as RecordRow[]) {
    const state: EqaDocumentState = { documentType: asString(row.document_type) as EqaDocumentType, entityId: asString(row.entity_id), revision: Number(row.revision), status: asString(row.status) === 'approved' ? 'approved' : 'draft' }
    states.set(documentKey(state.documentType, state.entityId), state)
  }
  const approvalsByRevision = new Map<string, EqaDocumentApproval[]>()
  for (const row of approvalData as RecordRow[]) {
    const approval: EqaDocumentApproval = {
      id: asString(row.id), documentType: asString(row.document_type) as EqaDocumentType, entityId: asString(row.entity_id), revision: Number(row.revision),
      approvalRole: asString(row.approval_role) as EqaApprovalRole, approvedById: asString(row.approved_by), approvedByName: userNameMap.get(asString(row.approved_by)) ?? '-', approvedAt: asString(row.approved_at),
    }
    const key = approvalKey(approval.documentType, approval.entityId, approval.revision)
    approvalsByRevision.set(key, [...(approvalsByRevision.get(key) ?? []), approval])
  }
  const stateFor = (type: EqaDocumentType, id: string) => states.get(documentKey(type, id)) ?? defaultDocumentState(type, id)

  const occurrencesByItem = new Map<string, EqaPlanOccurrence[]>()
  for (const row of occurrenceData as RecordRow[]) {
    const occurrence: EqaPlanOccurrence = {
      id: asString(row.id), planItemId: asString(row.plan_item_id), plannedMonth: Number(row.planned_month), responsibleUserId: nullableString(row.responsible_user_id),
      responsibleName: row.responsible_user_id ? userNameMap.get(asString(row.responsible_user_id)) ?? null : null,
      responsibleCode: asString(row.responsible_code), sortOrder: Number(row.sort_order ?? 0),
    }
    occurrencesByItem.set(occurrence.planItemId, [...(occurrencesByItem.get(occurrence.planItemId) ?? []), occurrence])
  }
  const planItems: EqaPlanItem[] = (planItemData as RecordRow[]).map((row) => ({
    id: asString(row.id), planId: asString(row.plan_id), schemeId: asString(row.scheme_id), projectName: asString(row.project_name), providerName: asString(row.provider_name),
    sampleSetName: asString(row.sample_set_name), externalCode: nullableString(row.external_code), testItem: asString(row.test_item), expectedRounds: nullableNumber(row.expected_rounds),
    maintenanceBudget: Boolean(row.maintenance_budget), tor: Boolean(row.tor), price: nullableNumber(row.price), evaluationCriteria: nullableString(row.evaluation_criteria),
    equipmentName: nullableString(row.equipment_name), note: nullableString(row.note), sortOrder: Number(row.sort_order ?? 0), occurrences: occurrencesByItem.get(asString(row.id)) ?? [],
  }))
  const planItemMap = new Map(planItems.map((item) => [item.id, item]))
  const planRows = planData as RecordRow[]
  const planYearById = new Map(planRows.map((row) => [asString(row.id), Number(row.plan_year)]))

  const resultsByRound = new Map<string, EqaResult[]>()
  for (const row of resultData as RecordRow[]) {
    const result: EqaResult = {
      id: asString(row.id), roundId: asString(row.round_id), analyte: asString(row.analyte), sampleCode: nullableString(row.sample_code),
      submittedValue: nullableString(row.submitted_value), unit: nullableString(row.unit), ctValue: nullableNumber(row.ct_value), evaluationScore: nullableNumber(row.evaluation_score),
      outcome: asString(row.outcome) as EqaOutcome, iqcAnalyteId: nullableString(row.iqc_analyte_id), assignedValue: nullableNumber(row.assigned_value),
    }
    resultsByRound.set(result.roundId, [...(resultsByRound.get(result.roundId) ?? []), result])
  }

  const today = todayBangkok()
  const rounds: EqaRound[] = (roundData as RecordRow[]).map((row) => {
    const scheme = schemeMap.get(asString(row.scheme_id))
    const planItem = planItemMap.get(asString(row.plan_item_id))
    const status = asString(row.status) as EqaRoundStatus
    const due = nullableString(row.result_due_date)
    let dueInDays: number | null = null
    let reminder: 'overdue' | 'due-soon' | null = null
    if (due && OPEN_STATUSES.has(status)) {
      dueInDays = daysUntil(due, today)
      if (dueInDays < 0) reminder = 'overdue'
      else if (dueInDays <= EQA_DUE_SOON_DAYS) reminder = 'due-soon'
    }
    const id = asString(row.id)
    const state = stateFor('round-receipt', id)
    const round: EqaRound = {
      id, schemeId: asString(row.scheme_id), schemeName: scheme?.name ?? '-', providerName: planItem?.providerName ?? scheme?.providerName ?? '-', equipment: scheme?.equipment ?? [],
      planItemId: nullableString(row.plan_item_id), planYear: planItem ? planYearById.get(planItem.planId) ?? null : null, planItemName: planItem?.sampleSetName ?? null,
      roundLabel: asString(row.round_label), externalSentDate: nullableString(row.external_sent_date), sampleReceivedDate: nullableString(row.sample_received_date), resultDueDate: due,
      submissionDate: nullableString(row.submission_date), status, note: nullableString(row.note), packageCondition: nullableString(row.package_condition) as EqaCondition | null,
      packageNote: nullableString(row.package_note), receivedTemperature: nullableString(row.received_temperature) as EqaTemperatureCondition | null,
      receivedTemperatureNote: nullableString(row.received_temperature_note), sampleCondition: nullableString(row.sample_condition) as EqaCondition | null,
      sampleConditionNote: nullableString(row.sample_condition_note), storageCondition: nullableString(row.storage_condition) as EqaTemperatureCondition | null,
      storageTemperatureC: nullableNumber(row.storage_temperature_c), storageNote: nullableString(row.storage_note), specimenType: nullableString(row.specimen_type),
      receiverId: nullableString(row.receiver_id), receiverName: row.receiver_id ? userNameMap.get(asString(row.receiver_id)) ?? null : null,
      analystId: nullableString(row.analyst_id), analystName: row.analyst_id ? userNameMap.get(asString(row.analyst_id)) ?? null : null,
      analysisDate: nullableString(row.analysis_date), submissionMethod: nullableString(row.submission_method), otherDetails: nullableString(row.other_details),
      summaryOutcome: asString(row.summary_outcome) as EqaRoundSummaryOutcome, summaryNote: nullableString(row.summary_note), results: resultsByRound.get(id) ?? [],
      dueInDays, reminder, documentState: state, approvals: approvalsByRevision.get(approvalKey('round-receipt', id, state.revision)) ?? [], receiptReadiness: [],
    }
    round.receiptReadiness = roundReceiptReadiness(round)
    return round
  })
  const roundMap = new Map(rounds.map((round) => [round.id, round]))

  const correctiveRows = caData as RecordRow[]
  const correctiveActions: EqaCorrectiveAction[] = correctiveRows.map((row) => ({
    id: asString(row.id), roundId: asString(row.round_id), roundLabel: roundMap.get(asString(row.round_id))?.roundLabel ?? '-', problem: asString(row.problem),
    rootCause: nullableString(row.root_cause), actionTaken: nullableString(row.action_taken), status: asString(row.status) === 'closed' ? 'closed' : 'open',
    createdByName: userNameMap.get(asString(row.created_by)) ?? null, createdAt: asString(row.created_at),
    closedByName: row.closed_by ? userNameMap.get(asString(row.closed_by)) ?? null : null, closedAt: nullableString(row.closed_at),
  }))

  const annualPlans: EqaAnnualPlan[] = planRows.map((row) => {
    const id = asString(row.id)
    const items = planItems.filter((item) => item.planId === id).sort((a, b) => a.sortOrder - b.sortOrder)
    const state = stateFor('annual-plan', id)
    return {
      id, planYear: Number(row.plan_year), workSection: asString(row.work_section), departmentName: asString(row.department_name), organizationName: asString(row.organization_name),
      items, documentState: state, approvals: approvalsByRevision.get(approvalKey('annual-plan', id, state.revision)) ?? [], readiness: annualPlanReadiness(items),
    }
  })
  const planMap = new Map(annualPlans.map((plan) => [plan.id, plan]))

  const annualSummaries: EqaAnnualSummary[] = planItems.map((item) => {
    const plan = planMap.get(item.planId)
    const itemRounds = rounds.filter((round) => round.planItemId === item.id)
    const state = stateFor('annual-summary', item.id)
    return {
      planItem: item,
      plan: { id: plan?.id ?? item.planId, planYear: plan?.planYear ?? 0, workSection: plan?.workSection ?? 'งานอณูชีววิทยา', departmentName: plan?.departmentName ?? 'กลุ่มงานเทคนิคการแพทย์', organizationName: plan?.organizationName ?? 'โรงพยาบาลชลบุรี' },
      rounds: itemRounds, documentState: state, approvals: approvalsByRevision.get(approvalKey('annual-summary', item.id, state.revision)) ?? [],
      readiness: annualSummaryReadiness(item, itemRounds, correctiveActions),
    }
  })

  const approverAssignments: EqaApproverAssignment[] = (assignmentData as RecordRow[]).map((row) => ({
    approvalRole: asString(row.approval_role) as EqaAssignedApprovalRole, userId: asString(row.user_id), userName: userNameMap.get(asString(row.user_id)) ?? '-',
  }))

  return {
    providers, schemes, annualPlans, rounds, annualSummaries, correctiveActions, approverAssignments, users,
    iqcAnalytes: (iqcAnalyteData as RecordRow[]).map((row) => ({ id: asString(row.id), code: asString(row.code), name: asString(row.name) })),
    summary: {
      schemeCount: schemes.filter((scheme) => scheme.isActive).length,
      overdue: rounds.filter((round) => round.reminder === 'overdue').length,
      dueSoon: rounds.filter((round) => round.reminder === 'due-soon').length,
      unacceptable: rounds.reduce((sum, round) => sum + round.results.filter((result) => result.outcome === 'unacceptable').length, 0),
      openCorrectiveActions: correctiveActions.filter((action) => action.status === 'open').length,
    },
  }
}

async function invalidateDocument(documentType: EqaDocumentType, entityId: string) {
  const admin = getAdminClient()
  const { data, error } = await admin.from('eqa_document_states').select('*').eq('document_type', documentType).eq('entity_id', entityId).maybeSingle()
  fail(error)
  if (!data) {
    fail((await admin.from('eqa_document_states').insert({ document_type: documentType, entity_id: entityId, revision: 1, status: 'draft' })).error)
    return
  }
  const row = data as RecordRow
  const revision = Number(row.revision)
  const { count, error: approvalError } = await admin.from('eqa_document_approvals').select('id', { count: 'exact', head: true }).eq('document_type', documentType).eq('entity_id', entityId).eq('revision', revision)
  fail(approvalError)
  fail((await admin.from('eqa_document_states').update({ revision: (count ?? 0) > 0 || row.status === 'approved' ? revision + 1 : revision, status: 'draft', updated_at: new Date().toISOString() }).eq('id', asString(row.id))).error)
}

async function invalidateRoundDocuments(roundId: string, includeReceipt = true) {
  const admin = getAdminClient()
  const { data, error } = await admin.from('eqa_rounds').select('plan_item_id').eq('id', roundId).maybeSingle()
  fail(error)
  if (includeReceipt) await invalidateDocument('round-receipt', roundId)
  const planItemId = nullableString((data as RecordRow | null)?.plan_item_id)
  if (planItemId) await invalidateDocument('annual-summary', planItemId)
}

const EQA_ENTITY = { provider: 'eqa_providers', scheme: 'eqa_schemes' } as const

export async function setEqaEntityActive(entity: keyof typeof EQA_ENTITY, id: string, isActive: boolean, actor: BmActor) {
  assertAdmin(actor)
  fail((await getAdminClient().from(EQA_ENTITY[entity]).update({ is_active: isActive }).eq('id', id)).error)
  await writeAudit(actor, `eqa.${entity}.setActive`, `eqa-${entity}`, id, { isActive })
  return getEqaWorkspace(actor)
}

export async function createProvider(input: { name: string }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_providers').insert({ name: input.name.trim(), created_by: actor.id }).select('id').single()
  fail(error); await writeAudit(actor, 'eqa.provider.create', 'eqa-provider', asString((data as RecordRow).id), input); return getEqaWorkspace(actor)
}
export async function updateProvider(id: string, input: { name: string }, actor: BmActor) {
  assertAdmin(actor); fail((await getAdminClient().from('eqa_providers').update({ name: input.name.trim() }).eq('id', id)).error); await writeAudit(actor, 'eqa.provider.update', 'eqa-provider', id, input); return getEqaWorkspace(actor)
}
export async function deleteProvider(id: string, actor: BmActor) {
  assertAdmin(actor); const admin = getAdminClient(); const { count, error } = await admin.from('eqa_schemes').select('id', { count: 'exact', head: true }).eq('provider_id', id); fail(error)
  if (count) throw new HttpError(409, 'ลบ provider ไม่ได้ เพราะมี scheme ผูกอยู่')
  fail((await admin.from('eqa_providers').delete().eq('id', id)).error); await writeAudit(actor, 'eqa.provider.delete', 'eqa-provider', id, {}); return getEqaWorkspace(actor)
}

export async function createScheme(input: { providerId: string; name: string; code?: string | null; analyteScope?: string | null; roundsPerYear?: number | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_schemes').insert({ provider_id: input.providerId, name: input.name.trim(), code: clean(input.code), analyte_scope: clean(input.analyteScope), rounds_per_year: input.roundsPerYear ?? null, created_by: actor.id }).select('id').single()
  fail(error); await writeAudit(actor, 'eqa.scheme.create', 'eqa-scheme', asString((data as RecordRow).id), input); return getEqaWorkspace(actor)
}
export async function updateScheme(id: string, input: { providerId: string; name: string; code?: string | null; analyteScope?: string | null; roundsPerYear?: number | null }, actor: BmActor) {
  assertAdmin(actor); fail((await getAdminClient().from('eqa_schemes').update({ provider_id: input.providerId, name: input.name.trim(), code: clean(input.code), analyte_scope: clean(input.analyteScope), rounds_per_year: input.roundsPerYear ?? null }).eq('id', id)).error)
  await writeAudit(actor, 'eqa.scheme.update', 'eqa-scheme', id, input); return getEqaWorkspace(actor)
}
export async function deleteScheme(id: string, actor: BmActor) {
  assertAdmin(actor); const admin = getAdminClient(); const { count, error } = await admin.from('eqa_rounds').select('id', { count: 'exact', head: true }).eq('scheme_id', id); fail(error)
  if (count) throw new HttpError(409, 'ลบ scheme ไม่ได้ เพราะมี round ผูกอยู่')
  fail((await admin.from('eqa_schemes').delete().eq('id', id)).error); await writeAudit(actor, 'eqa.scheme.delete', 'eqa-scheme', id, {}); return getEqaWorkspace(actor)
}

export async function createAnnualPlan(input: { planYear: number; workSection?: string; departmentName?: string; organizationName?: string }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('eqa_annual_plans').insert({ plan_year: input.planYear, work_section: clean(input.workSection) ?? 'งานอณูชีววิทยา', department_name: clean(input.departmentName) ?? 'กลุ่มงานเทคนิคการแพทย์', organization_name: clean(input.organizationName) ?? 'โรงพยาบาลชลบุรี', created_by: actor.id }).select('id').single()
  fail(error); const id = asString((data as RecordRow).id); await invalidateDocument('annual-plan', id); await writeAudit(actor, 'eqa.plan.create', 'eqa-annual-plan', id, input); return getEqaWorkspace(actor)
}
export async function updateAnnualPlan(id: string, input: { workSection: string; departmentName: string; organizationName: string }, actor: BmActor) {
  assertAdmin(actor); fail((await getAdminClient().from('eqa_annual_plans').update({ work_section: input.workSection.trim(), department_name: input.departmentName.trim(), organization_name: input.organizationName.trim(), updated_at: new Date().toISOString() }).eq('id', id)).error)
  await invalidateDocument('annual-plan', id)
  const { data: items, error } = await getAdminClient().from('eqa_plan_items').select('id').eq('plan_id', id); fail(error)
  for (const item of (items ?? []) as RecordRow[]) await invalidateDocument('annual-summary', asString(item.id))
  await writeAudit(actor, 'eqa.plan.update', 'eqa-annual-plan', id, input); return getEqaWorkspace(actor)
}

async function replacePlanOccurrences(planItemId: string, occurrences: EqaPlanItemInput['occurrences'], actor: BmActor) {
  const admin = getAdminClient(); fail((await admin.from('eqa_plan_occurrences').delete().eq('plan_item_id', planItemId)).error)
  if (occurrences?.length) {
    fail((await admin.from('eqa_plan_occurrences').insert(occurrences.map((occurrence, index) => ({ plan_item_id: planItemId, planned_month: occurrence.plannedMonth, responsible_user_id: occurrence.responsibleUserId || null, responsible_code: occurrence.responsibleCode.trim(), sort_order: occurrence.sortOrder ?? index, created_by: actor.id })))).error)
  }
}
function planItemPayload(input: EqaPlanItemInput) {
  return { plan_id: input.planId, scheme_id: input.schemeId, project_name: input.projectName.trim(), provider_name: input.providerName.trim(), sample_set_name: input.sampleSetName.trim(), external_code: clean(input.externalCode), test_item: input.testItem.trim(), expected_rounds: input.expectedRounds ?? null, maintenance_budget: Boolean(input.maintenanceBudget), tor: Boolean(input.tor), price: input.price ?? null, evaluation_criteria: clean(input.evaluationCriteria), equipment_name: clean(input.equipmentName), note: clean(input.note), sort_order: input.sortOrder ?? 0, updated_at: new Date().toISOString() }
}
export async function createPlanItem(input: EqaPlanItemInput, actor: BmActor) {
  assertAdmin(actor); const { data, error } = await getAdminClient().from('eqa_plan_items').insert({ ...planItemPayload(input), created_by: actor.id }).select('id').single(); fail(error)
  const id = asString((data as RecordRow).id); await replacePlanOccurrences(id, input.occurrences, actor); await invalidateDocument('annual-plan', input.planId); await invalidateDocument('annual-summary', id)
  await writeAudit(actor, 'eqa.planItem.create', 'eqa-plan-item', id, { ...input }); return getEqaWorkspace(actor)
}
export async function updatePlanItem(id: string, input: EqaPlanItemInput, actor: BmActor) {
  assertAdmin(actor); fail((await getAdminClient().from('eqa_plan_items').update(planItemPayload(input)).eq('id', id)).error); await replacePlanOccurrences(id, input.occurrences, actor)
  await invalidateDocument('annual-plan', input.planId); await invalidateDocument('annual-summary', id); await writeAudit(actor, 'eqa.planItem.update', 'eqa-plan-item', id, { ...input }); return getEqaWorkspace(actor)
}
export async function deletePlanItem(id: string, actor: BmActor) {
  assertAdmin(actor); const admin = getAdminClient(); const { data, error } = await admin.from('eqa_plan_items').select('plan_id').eq('id', id).maybeSingle(); fail(error); if (!data) throw new HttpError(404, 'Plan item not found')
  const { count, error: roundError } = await admin.from('eqa_rounds').select('id', { count: 'exact', head: true }).eq('plan_item_id', id); fail(roundError); if (count) throw new HttpError(409, 'ลบไม่ได้ เพราะมี round ผูกอยู่')
  fail((await admin.from('eqa_plan_items').delete().eq('id', id)).error); await invalidateDocument('annual-plan', asString((data as RecordRow).plan_id)); await writeAudit(actor, 'eqa.planItem.delete', 'eqa-plan-item', id, {}); return getEqaWorkspace(actor)
}

export async function createRound(input: { planItemId: string; roundLabel: string; sampleReceivedDate?: string | null; resultDueDate?: string | null; note?: string | null }, actor: BmActor) {
  assertAdmin(actor); const admin = getAdminClient(); const { data: item, error: itemError } = await admin.from('eqa_plan_items').select('scheme_id').eq('id', input.planItemId).maybeSingle(); fail(itemError); if (!item) throw new HttpError(404, 'Plan item not found')
  const { data, error } = await admin.from('eqa_rounds').insert({ scheme_id: asString((item as RecordRow).scheme_id), plan_item_id: input.planItemId, round_label: input.roundLabel.trim(), sample_received_date: input.sampleReceivedDate || null, result_due_date: input.resultDueDate || null, note: clean(input.note), created_by: actor.id }).select('id').single(); fail(error)
  const id = asString((data as RecordRow).id); await invalidateRoundDocuments(id); await writeAudit(actor, 'eqa.round.create', 'eqa-round', id, input); return getEqaWorkspace(actor)
}
export async function updateRound(id: string, input: { roundLabel?: string; status?: EqaRoundStatus; submissionDate?: string | null; sampleReceivedDate?: string | null; resultDueDate?: string | null; note?: string | null }, actor: BmActor) {
  assertOperator(actor); const updates: RecordRow = {}
  if (input.roundLabel !== undefined) updates.round_label = input.roundLabel.trim(); if (input.status !== undefined) updates.status = input.status
  if (input.submissionDate !== undefined) updates.submission_date = input.submissionDate || null; if (input.sampleReceivedDate !== undefined) updates.sample_received_date = input.sampleReceivedDate || null
  if (input.resultDueDate !== undefined) updates.result_due_date = input.resultDueDate || null; if (input.note !== undefined) updates.note = clean(input.note); updates.updated_at = new Date().toISOString()
  fail((await getAdminClient().from('eqa_rounds').update(updates).eq('id', id)).error); await invalidateRoundDocuments(id, input.sampleReceivedDate !== undefined || input.submissionDate !== undefined)
  await writeAudit(actor, 'eqa.round.update', 'eqa-round', id, input); return getEqaWorkspace(actor)
}
export async function updateRoundReceipt(id: string, input: EqaRoundReceiptInput, actor: BmActor) {
  assertOperator(actor); const admin = getAdminClient(); const { data: item, error: itemError } = await admin.from('eqa_plan_items').select('scheme_id').eq('id', input.planItemId).maybeSingle(); fail(itemError); if (!item) throw new HttpError(404, 'Plan item not found')
  fail((await admin.from('eqa_rounds').update({ plan_item_id: input.planItemId, scheme_id: asString((item as RecordRow).scheme_id), external_sent_date: input.externalSentDate || null, sample_received_date: input.sampleReceivedDate || null, package_condition: input.packageCondition ?? null, package_note: clean(input.packageNote), received_temperature: input.receivedTemperature ?? null, received_temperature_note: clean(input.receivedTemperatureNote), sample_condition: input.sampleCondition ?? null, sample_condition_note: clean(input.sampleConditionNote), storage_condition: input.storageCondition ?? null, storage_temperature_c: input.storageTemperatureC ?? null, storage_note: clean(input.storageNote), specimen_type: clean(input.specimenType), receiver_id: input.receiverId || null, analyst_id: input.analystId || null, analysis_date: input.analysisDate || null, submission_date: input.submissionDate || null, submission_method: clean(input.submissionMethod), other_details: clean(input.otherDetails), updated_at: new Date().toISOString() }).eq('id', id)).error)
  await invalidateRoundDocuments(id); await writeAudit(actor, 'eqa.round.receipt.update', 'eqa-round', id, { ...input }); return getEqaWorkspace(actor)
}
export async function updateRoundSummary(id: string, input: { summaryOutcome: EqaRoundSummaryOutcome; summaryNote?: string | null }, actor: BmActor) {
  assertOperator(actor); fail((await getAdminClient().from('eqa_rounds').update({ summary_outcome: input.summaryOutcome, summary_note: clean(input.summaryNote), updated_at: new Date().toISOString() }).eq('id', id)).error)
  await invalidateRoundDocuments(id, false); await writeAudit(actor, 'eqa.round.summary.update', 'eqa-round', id, input); return getEqaWorkspace(actor)
}
export async function deleteRound(id: string, actor: BmActor) {
  assertAdmin(actor); const admin = getAdminClient(); const { data, error } = await admin.from('eqa_rounds').select('plan_item_id').eq('id', id).maybeSingle(); fail(error); const planItemId = nullableString((data as RecordRow | null)?.plan_item_id)
  const { count, error: caError } = await admin.from('eqa_corrective_actions').select('id', { count: 'exact', head: true }).eq('round_id', id); fail(caError); if (count) throw new HttpError(409, 'ลบ round ไม่ได้ เพราะมี corrective action ผูกอยู่')
  fail((await admin.from('eqa_rounds').delete().eq('id', id)).error); if (planItemId) await invalidateDocument('annual-summary', planItemId); await writeAudit(actor, 'eqa.round.delete', 'eqa-round', id, {}); return getEqaWorkspace(actor)
}

export async function createResult(input: { roundId: string; analyte: string; sampleCode?: string | null; submittedValue?: string | null; unit?: string | null; ctValue?: number | null; evaluationScore?: number | null; outcome: EqaOutcome; iqcAnalyteId?: string | null; assignedValue?: number | null }, actor: BmActor) {
  assertOperator(actor); const { data, error } = await getAdminClient().from('eqa_results').insert({ round_id: input.roundId, analyte: input.analyte.trim(), sample_code: clean(input.sampleCode), submitted_value: clean(input.submittedValue), unit: clean(input.unit), ct_value: input.ctValue ?? null, evaluation_score: input.evaluationScore ?? null, outcome: input.outcome, iqc_analyte_id: input.iqcAnalyteId || null, assigned_value: input.assignedValue ?? null, created_by: actor.id }).select('id').single(); fail(error)
  const id = asString((data as RecordRow).id); await invalidateRoundDocuments(input.roundId); await writeAudit(actor, 'eqa.result.create', 'eqa-result', id, input); return getEqaWorkspace(actor)
}
export async function updateResult(id: string, input: { analyte: string; sampleCode?: string | null; submittedValue?: string | null; unit?: string | null; ctValue?: number | null; evaluationScore?: number | null; outcome: EqaOutcome; iqcAnalyteId?: string | null; assignedValue?: number | null }, actor: BmActor) {
  assertOperator(actor); const admin = getAdminClient(); const { data: current, error: currentError } = await admin.from('eqa_results').select('round_id').eq('id', id).maybeSingle(); fail(currentError); if (!current) throw new HttpError(404, 'EQA result not found')
  fail((await admin.from('eqa_results').update({ analyte: input.analyte.trim(), sample_code: clean(input.sampleCode), submitted_value: clean(input.submittedValue), unit: clean(input.unit), ct_value: input.ctValue ?? null, evaluation_score: input.evaluationScore ?? null, outcome: input.outcome, iqc_analyte_id: input.iqcAnalyteId || null, assigned_value: input.assignedValue ?? null }).eq('id', id)).error)
  await invalidateRoundDocuments(asString((current as RecordRow).round_id)); await writeAudit(actor, 'eqa.result.update', 'eqa-result', id, input); return getEqaWorkspace(actor)
}
export async function deleteResult(id: string, actor: BmActor) {
  assertOperator(actor); const admin = getAdminClient(); const { data, error } = await admin.from('eqa_results').select('round_id,analyte').eq('id', id).maybeSingle(); fail(error); if (!data) throw new HttpError(404, 'EQA result not found')
  fail((await admin.from('eqa_results').delete().eq('id', id)).error); await invalidateRoundDocuments(asString((data as RecordRow).round_id)); await writeAudit(actor, 'eqa.result.delete', 'eqa-result', id, { analyte: asString((data as RecordRow).analyte) }); return getEqaWorkspace(actor)
}

export async function createEqaCorrectiveAction(input: { roundId: string; resultId?: string | null; problem: string; rootCause?: string | null; actionTaken?: string | null }, actor: BmActor) {
  assertOperator(actor); if (!input.problem.trim()) throw new HttpError(400, 'Problem description is required')
  const { data, error } = await getAdminClient().from('eqa_corrective_actions').insert({ round_id: input.roundId, result_id: input.resultId || null, problem: input.problem.trim(), root_cause: clean(input.rootCause), action_taken: clean(input.actionTaken), created_by: actor.id }).select('id').single(); fail(error)
  const id = asString((data as RecordRow).id); await invalidateRoundDocuments(input.roundId, false); await writeAudit(actor, 'eqa.correctiveAction.create', 'eqa-corrective-action', id, input); return getEqaWorkspace(actor)
}
export async function closeEqaCorrectiveAction(id: string, input: { rootCause?: string | null; actionTaken?: string | null }, actor: BmActor) {
  assertOperator(actor); const admin = getAdminClient(); const { data, error } = await admin.from('eqa_corrective_actions').select('round_id').eq('id', id).maybeSingle(); fail(error); if (!data) throw new HttpError(404, 'Corrective action not found')
  fail((await admin.from('eqa_corrective_actions').update({ root_cause: clean(input.rootCause), action_taken: clean(input.actionTaken), status: 'closed', closed_by: actor.id, closed_at: new Date().toISOString() }).eq('id', id)).error)
  await invalidateRoundDocuments(asString((data as RecordRow).round_id), false); await writeAudit(actor, 'eqa.correctiveAction.close', 'eqa-corrective-action', id, input); return getEqaWorkspace(actor)
}

export async function setEqaApproverAssignment(role: EqaAssignedApprovalRole, userId: string, actor: BmActor) {
  assertAdmin(actor); if (!ASSIGNED_APPROVAL_ROLES.includes(role)) throw new HttpError(400, 'Invalid approval role')
  fail((await getAdminClient().from('eqa_approver_assignments').upsert({ approval_role: role, user_id: userId, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'approval_role' })).error)
  await writeAudit(actor, 'eqa.approver.assign', 'eqa-approver-assignment', role, { userId }); return getEqaWorkspace(actor)
}

function documentReadiness(workspace: EqaWorkspace, type: EqaDocumentType, entityId: string) {
  if (type === 'annual-plan') return workspace.annualPlans.find((plan) => plan.id === entityId)?.readiness ?? ['ไม่พบแผน']
  if (type === 'round-receipt') return workspace.rounds.find((round) => round.id === entityId)?.receiptReadiness ?? ['ไม่พบ round']
  return workspace.annualSummaries.find((summary) => summary.planItem.id === entityId)?.readiness ?? ['ไม่พบสรุป']
}
function documentState(workspace: EqaWorkspace, type: EqaDocumentType, entityId: string) {
  if (type === 'annual-plan') return workspace.annualPlans.find((plan) => plan.id === entityId)?.documentState
  if (type === 'round-receipt') return workspace.rounds.find((round) => round.id === entityId)?.documentState
  return workspace.annualSummaries.find((summary) => summary.planItem.id === entityId)?.documentState
}
function documentApprovals(workspace: EqaWorkspace, type: EqaDocumentType, entityId: string) {
  if (type === 'annual-plan') return workspace.annualPlans.find((plan) => plan.id === entityId)?.approvals ?? []
  if (type === 'round-receipt') return workspace.rounds.find((round) => round.id === entityId)?.approvals ?? []
  return workspace.annualSummaries.find((summary) => summary.planItem.id === entityId)?.approvals ?? []
}

export async function approveEqaDocument(type: EqaDocumentType, entityId: string, role: EqaApprovalRole, actor: BmActor) {
  assertOperator(actor); if (!REQUIRED_APPROVALS[type].includes(role)) throw new HttpError(400, 'Approval role is not required for this document')
  const workspace = await getEqaWorkspace(actor); const readiness = documentReadiness(workspace, type, entityId); if (readiness.length) throw new HttpError(409, readiness.join(' | '))
  if (role === 'analyst') {
    const round = workspace.rounds.find((item) => item.id === entityId); if (!round || round.analystId !== actor.id) throw new HttpError(403, 'Only the assigned analyst can approve this receipt')
  } else {
    const assignment = workspace.approverAssignments.find((item) => item.approvalRole === role); if (!assignment || assignment.userId !== actor.id) throw new HttpError(403, 'You are not assigned to this approval role')
  }
  const state = documentState(workspace, type, entityId) ?? defaultDocumentState(type, entityId); const admin = getAdminClient()
  fail((await admin.from('eqa_document_states').upsert({ document_type: type, entity_id: entityId, revision: state.revision, status: 'draft', updated_at: new Date().toISOString() }, { onConflict: 'document_type,entity_id' })).error)
  fail((await admin.from('eqa_document_approvals').upsert({ document_type: type, entity_id: entityId, revision: state.revision, approval_role: role, approved_by: actor.id, approved_at: new Date().toISOString() }, { onConflict: 'document_type,entity_id,revision,approval_role' })).error)
  const approvedRoles = new Set([...documentApprovals(workspace, type, entityId).map((approval) => approval.approvalRole), role])
  const complete = REQUIRED_APPROVALS[type].every((requiredRole) => approvedRoles.has(requiredRole))
  fail((await admin.from('eqa_document_states').update({ status: complete ? 'approved' : 'draft', updated_at: new Date().toISOString() }).eq('document_type', type).eq('entity_id', entityId)).error)
  await writeAudit(actor, 'eqa.document.approve', `eqa-${type}`, entityId, { role, revision: state.revision, complete }); return getEqaWorkspace(actor)
}

export async function revokeEqaDocumentApproval(type: EqaDocumentType, entityId: string, role: EqaApprovalRole, actor: BmActor) {
  assertOperator(actor); const workspace = await getEqaWorkspace(actor); const state = documentState(workspace, type, entityId) ?? defaultDocumentState(type, entityId)
  const approval = documentApprovals(workspace, type, entityId).find((item) => item.approvalRole === role); if (!approval) throw new HttpError(404, 'Approval not found')
  if (approval.approvedById !== actor.id && actor.role !== 'Admin') throw new HttpError(403, 'Only the approver or Admin can revoke this approval')
  const admin = getAdminClient(); fail((await admin.from('eqa_document_approvals').delete().eq('document_type', type).eq('entity_id', entityId).eq('revision', state.revision).eq('approval_role', role)).error)
  fail((await admin.from('eqa_document_states').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('document_type', type).eq('entity_id', entityId)).error)
  await writeAudit(actor, 'eqa.document.approval.revoke', `eqa-${type}`, entityId, { role, revision: state.revision }); return getEqaWorkspace(actor)
}
