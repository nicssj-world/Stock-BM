import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { deleteStoredAttachment, uploadAttachment } from '@/lib/server/attachments'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import type { VendorSignificantEvent } from '@/lib/receiving/types'
import type { VendorEvaluationJudgmentInput } from '@/lib/vendors/evaluation-schemas'
import { VENDOR_EVALUATION_ROLES, type VendorEvaluation, type VendorEvaluationApproval, type VendorEvaluationAssignment, type VendorEvaluationDocumentState, type VendorEvaluationRole, type VendorEvaluationWorkspace } from '@/lib/vendors/evaluation-types'
import type { VendorMetrics } from '@/lib/vendors/types'
import { getVendorPerformance } from '@/lib/server/vendors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
type SupabaseError = { code?: string; message: string }

function fail(error: SupabaseError | null, message = 'Vendor evaluation database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function asString(value: unknown) { return typeof value === 'string' ? value : '' }
function nullableString(value: unknown) { return typeof value === 'string' ? value : null }
function asNumber(value: unknown) { return typeof value === 'number' ? value : Number(value ?? 0) }
function asObject<T extends object>(value: unknown, fallback: T) { return value && typeof value === 'object' && !Array.isArray(value) ? value as T : fallback }
function role(value: unknown): VendorEvaluationRole {
  return VENDOR_EVALUATION_ROLES.includes(value as VendorEvaluationRole) ? value as VendorEvaluationRole : 'evaluator'
}

const emptyJudgment: VendorEvaluation['judgment'] = { summary: '', strengths: '', risks: '', actions: '' }

function toEvaluation(row: RecordRow): VendorEvaluation {
  return {
    id: asString(row.id),
    vendorId: asString(row.vendor_id),
    fiscalYear: asString(row.fiscal_year),
    revision: asNumber(row.revision),
    metricsSnapshot: asObject(row.metrics_snapshot, {}) as VendorMetrics,
    judgment: { ...emptyJudgment, ...asObject(row.judgment, {}) },
    significantEventsSnapshot: Array.isArray(row.significant_events_snapshot) ? row.significant_events_snapshot as VendorSignificantEvent[] : [],
    policyId: nullableString(row.policy_id),
    result: row.result == null ? null : asNumber(row.result),
    resultLabel: nullableString(row.result_label),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

function toState(row: RecordRow, evaluation: VendorEvaluation): VendorEvaluationDocumentState {
  return {
    evaluationId: evaluation.id,
    revision: asNumber(row.revision) || evaluation.revision,
    status: asString(row.status) === 'approved' ? 'approved' : 'draft',
    updatedAt: asString(row.updated_at),
  }
}

function toApproval(row: RecordRow, userNames: Map<string, string>): VendorEvaluationApproval {
  const approvedBy = asString(row.approved_by)
  return {
    id: asString(row.id),
    evaluationId: asString(row.evaluation_id),
    revision: asNumber(row.revision),
    approvalRole: role(row.approval_role),
    approvedBy,
    approvedByName: userNames.get(approvedBy) ?? '-',
    approvedAt: asString(row.approved_at),
    signerName: nullableString(row.signer_name),
    signatureAttachmentId: nullableString(row.signature_attachment_id),
  }
}

async function evaluationRow(id: string) {
  const { data, error } = await getAdminClient().from('bm_vendor_evaluations').select('*').eq('id', id).maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'ไม่พบ annual vendor evaluation')
  return data as RecordRow
}

async function loadWorkspace(row: RecordRow): Promise<VendorEvaluationWorkspace> {
  const evaluation = toEvaluation(row)
  const admin = getAdminClient()
  const [{ data: stateData, error: stateError }, { data: approvalData, error: approvalError }, { data: assignmentData, error: assignmentError }, { data: policyData, error: policyError }] = await Promise.all([
    admin.from('bm_vendor_eval_document_states').select('*').eq('evaluation_id', evaluation.id).maybeSingle(),
    admin.from('bm_vendor_eval_approvals').select('*').eq('evaluation_id', evaluation.id).order('approved_at'),
    admin.from('bm_vendor_eval_approver_assignments').select('*'),
    admin.from('bm_vendor_eval_policies').select('id,version,is_approved').order('version', { ascending: false }).limit(1).maybeSingle(),
  ])
  fail(stateError); fail(approvalError); fail(assignmentError); fail(policyError)
  const approvals = (approvalData ?? []) as RecordRow[]
  const assignments = (assignmentData ?? []) as RecordRow[]
  const ids = [...approvals.map((item) => asString(item.approved_by)), ...assignments.map((item) => asString(item.user_id))].filter(Boolean)
  const { data: users, error: usersError } = ids.length ? await admin.from('nipt_users').select('id,display_name').in('id', [...new Set(ids)]) : { data: [], error: null }
  fail(usersError)
  const userNames = new Map(((users ?? []) as RecordRow[]).map((user) => [asString(user.id), asString(user.display_name)]))
  const performance = await getVendorPerformance(evaluation.vendorId, evaluation.fiscalYear)
  const policy = policyData as RecordRow | null
  return {
    vendor: performance.vendor,
    evaluation,
    documentState: stateData ? toState(stateData as RecordRow, evaluation) : { evaluationId: evaluation.id, revision: evaluation.revision, status: 'draft', updatedAt: evaluation.updatedAt },
    approvals: approvals.map((item) => toApproval(item, userNames)),
    assignments: assignments.map((item) => ({ approvalRole: role(item.approval_role), userId: asString(item.user_id), userName: userNames.get(asString(item.user_id)) ?? '-' } satisfies VendorEvaluationAssignment)),
    policy: policy ? { id: asString(policy.id), version: asNumber(policy.version), isApproved: Boolean(policy.is_approved) } : { id: '', version: 0, isApproved: false },
  }
}

export async function getVendorEvaluationWorkspace(id: string) {
  return loadWorkspace(await evaluationRow(id))
}

export async function createOrRegenerateVendorEvaluation(vendorId: string, fiscalYear: string, judgment: VendorEvaluationJudgmentInput, actor: BmActor) {
  const performance = await getVendorPerformance(vendorId, fiscalYear)
  const admin = getAdminClient()
  const { data: current, error: currentError } = await admin.from('bm_vendor_evaluations').select('*').eq('vendor_id', vendorId).eq('fiscal_year', fiscalYear).maybeSingle()
  fail(currentError)
  let evaluationId: string
  if (!current) {
    const { data, error } = await admin.from('bm_vendor_evaluations').insert({
      vendor_id: vendorId,
      fiscal_year: fiscalYear,
      revision: 1,
      metrics_snapshot: performance.metrics,
      judgment,
      significant_events_snapshot: performance.significantEvents,
      policy_id: null,
      result: null,
      result_label: null,
      created_by: actor.id,
    }).select('id').single()
    fail(error)
    evaluationId = asString((data as RecordRow).id)
    fail((await admin.from('bm_vendor_eval_document_states').insert({ evaluation_id: evaluationId, revision: 1, status: 'draft' })).error)
  } else {
    const currentRow = current as RecordRow
    const { data: currentState, error: currentStateError } = await admin.from('bm_vendor_eval_document_states').select('status').eq('evaluation_id', asString(currentRow.id)).maybeSingle()
    fail(currentStateError)
    if (asString((currentState as RecordRow | null)?.status) === 'approved') {
      throw new HttpError(409, 'ยังไม่ได้อนุมัติ policy การเปิด evaluation ที่ลงนามแล้ว (P-16)')
    }
    const nextRevision = asNumber(currentRow.revision) + 1
    evaluationId = asString(currentRow.id)
    fail((await admin.from('bm_vendor_evaluations').update({ revision: nextRevision, metrics_snapshot: performance.metrics, judgment, significant_events_snapshot: performance.significantEvents, policy_id: null, result: null, result_label: null, updated_at: new Date().toISOString() }).eq('id', evaluationId)).error)
    fail((await admin.from('bm_vendor_eval_document_states').upsert({ evaluation_id: evaluationId, revision: nextRevision, status: 'draft', updated_at: new Date().toISOString() }, { onConflict: 'evaluation_id' })).error)
  }
  await writeAudit(actor, current ? 'vendor.evaluation.regenerate' : 'vendor.evaluation.create', 'stock-vendor-evaluation', evaluationId, { vendorId, fiscalYear, revisionBumped: Boolean(current) })
  return loadWorkspace(await evaluationRow(evaluationId))
}

export async function approveVendorEvaluation(id: string, approvalRole: VendorEvaluationRole, signerNameInput: string, signature: File, actor: BmActor) {
  if (!VENDOR_EVALUATION_ROLES.includes(approvalRole)) throw new HttpError(400, 'บทบาทลงนามไม่ถูกต้อง')
  if (!(signature instanceof File) || signature.type !== 'image/png' || signature.size === 0) throw new HttpError(400, 'ลายเซ็นต้องเป็นไฟล์ PNG ที่ไม่ว่าง')
  if (signature.size > 2 * 1024 * 1024) throw new HttpError(400, 'ไฟล์ลายเซ็นใหญ่เกิน 2 MB')
  const row = await evaluationRow(id)
  const workspace = await loadWorkspace(row)
  if (!workspace.evaluation.judgment.summary.trim()) throw new HttpError(409, 'กรุณาบันทึก judgment ก่อนลงนาม')
  const assignment = workspace.assignments.find((item) => item.approvalRole === approvalRole)
  if (assignment && actor.role !== 'Admin' && assignment.userId !== actor.id) throw new HttpError(403, 'คุณไม่ได้รับมอบหมายบทบาทลงนามนี้')
  const existing = workspace.approvals.find((item) => item.revision === workspace.documentState.revision && item.approvalRole === approvalRole)
  if (existing?.signatureAttachmentId) throw new HttpError(409, 'บทบาทนี้ลงนามแล้ว กรุณาถอนลายเซ็นเดิมก่อนลงนามใหม่')
  const signerName = (actor.role !== 'Admin' && assignment?.userName && assignment.userName !== '-' ? assignment.userName : signerNameInput).trim()
  if (!signerName) throw new HttpError(400, 'กรุณากรอกชื่อ-นามสกุลผู้ลงนาม')
  if (signerName.length > 200) throw new HttpError(400, 'ชื่อผู้ลงนามยาวเกิน 200 ตัวอักษร')

  const admin = getAdminClient()
  const attachment = await uploadAttachment({ module: 'stock', entityType: 'stock-vendor-evaluation', entityId: id, kind: `signature:vendor-evaluation:${workspace.documentState.revision}:${approvalRole}`, file: signature }, actor)
  try {
    fail((await admin.from('bm_vendor_eval_approvals').upsert({ evaluation_id: id, revision: workspace.documentState.revision, approval_role: approvalRole, approved_by: actor.id, approved_at: new Date().toISOString(), signer_name: signerName, signature_attachment_id: attachment.id }, { onConflict: 'evaluation_id,revision,approval_role' })).error)
  } catch (error) {
    try { await deleteStoredAttachment(attachment.id) } catch { /* preserve the original database error */ }
    throw error
  }
  const { data: currentApprovals, error: currentApprovalError } = await admin.from('bm_vendor_eval_approvals').select('approval_role,signature_attachment_id').eq('evaluation_id', id).eq('revision', workspace.documentState.revision)
  fail(currentApprovalError)
  const signed = new Set(((currentApprovals ?? []) as RecordRow[]).filter((item) => item.signature_attachment_id).map((item) => asString(item.approval_role)))
  const complete = VENDOR_EVALUATION_ROLES.every((item) => signed.has(item))
  fail((await admin.from('bm_vendor_eval_document_states').update({ status: complete ? 'approved' : 'draft', updated_at: new Date().toISOString() }).eq('evaluation_id', id)).error)
  await writeAudit(actor, 'vendor.evaluation.sign', 'stock-vendor-evaluation', id, { approvalRole, revision: workspace.documentState.revision, complete, signatureAttachmentId: attachment.id })
  return loadWorkspace(await evaluationRow(id))
}

export async function revokeVendorEvaluationApproval(id: string, approvalRole: VendorEvaluationRole, actor: BmActor) {
  const workspace = await getVendorEvaluationWorkspace(id)
  const approval = workspace.approvals.find((item) => item.revision === workspace.documentState.revision && item.approvalRole === approvalRole)
  if (!approval) throw new HttpError(404, 'ไม่พบลายเซ็นของ revision ปัจจุบัน')
  if (approval.approvedBy !== actor.id && actor.role !== 'Admin') throw new HttpError(403, 'เฉพาะผู้ลงนามหรือ Admin เท่านั้นที่ถอนลายเซ็นได้')
  const admin = getAdminClient()
  fail((await admin.from('bm_vendor_eval_approvals').delete().eq('id', approval.id)).error)
  if (approval.signatureAttachmentId) { try { await deleteStoredAttachment(approval.signatureAttachmentId) } catch { /* approval row is already revoked */ } }
  fail((await admin.from('bm_vendor_eval_document_states').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('evaluation_id', id)).error)
  await writeAudit(actor, 'vendor.evaluation.signature.revoke', 'stock-vendor-evaluation', id, { approvalRole, revision: workspace.documentState.revision })
  return getVendorEvaluationWorkspace(id)
}
