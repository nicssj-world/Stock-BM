import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { throwRpcError } from '@/lib/server/vendor-errors'
import { getAdminClient } from '@/lib/supabase/admin'
import type { AnnualRevision, DraftInput, EvaluationPolicy, Frozen, PolicyProposalInput, PolicyStatus, Signer, Snapshot } from '@/lib/vendors/evaluation'
import { policyProposalError } from '@/lib/vendors/evaluation'

type RecordRow = Record<string, unknown>

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' ? value : null)
const nullableNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value))

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getAdminClient().rpc(name, args)
  throwRpcError(error)
  return data as T
}

// ---- Policy -----------------------------------------------------------------------------------------------------------

export async function listEvaluationPolicies(): Promise<EvaluationPolicy[]> {
  const { data, error } = await getAdminClient().from('bm_vendor_evaluation_policies')
    .select('id,version,status,effective_from_fiscal_year,effective_to_fiscal_year,pass_threshold,minimum_coverage_percent,coverage_start_date,note,approved_at,approved_by_name_snapshot,bm_vendor_evaluation_policy_criteria(criterion_code,display_order,label,weight,evidence_definition,calculation_definition,na_definition)')
    .order('effective_from_fiscal_year', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw new HttpError(400, error.message)
  return ((data ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    version: asString(row.version),
    status: asString(row.status) as PolicyStatus,
    effectiveFromFiscalYear: Number(row.effective_from_fiscal_year),
    effectiveToFiscalYear: nullableNumber(row.effective_to_fiscal_year),
    passThreshold: nullableNumber(row.pass_threshold),
    minimumCoveragePercent: nullableNumber(row.minimum_coverage_percent),
    coverageStartDate: asString(row.coverage_start_date),
    note: nullableString(row.note),
    approvedAt: nullableString(row.approved_at),
    approvedByName: nullableString(row.approved_by_name_snapshot),
    criteria: ((row.bm_vendor_evaluation_policy_criteria ?? []) as RecordRow[]).map((c) => ({
      criterionCode: asString(c.criterion_code),
      displayOrder: Number(c.display_order),
      label: asString(c.label),
      weight: nullableNumber(c.weight),
      evidenceDefinition: asString(c.evidence_definition),
      calculationDefinition: asString(c.calculation_definition),
      naDefinition: asString(c.na_definition),
    })),
  }))
}

export async function saveEvaluationPolicyProposal(input: PolicyProposalInput, actor: BmActor) {
  const invalid = policyProposalError(input)
  if (invalid) throw new HttpError(400, invalid)
  return rpc<string>('save_bm_vendor_evaluation_policy_proposal', {
    p_actor: actor.id,
    p_policy_id: input.policyId,
    p_policy: {
      version: input.version.trim(), effectiveFromFiscalYear: input.effectiveFromFiscalYear, effectiveToFiscalYear: input.effectiveToFiscalYear,
      passThreshold: input.passThreshold, minimumCoveragePercent: input.minimumCoveragePercent, coverageStartDate: input.coverageStartDate, note: input.note.trim(),
    },
    p_criteria: input.criteria,
  })
}

export async function approveEvaluationPolicy(policyId: string, actor: BmActor) {
  await rpc('approve_bm_vendor_evaluation_policy', { p_actor: actor.id, p_policy_id: policyId })
}

// ---- Annual evaluation ----------------------------------------------------------------------------------------------------

const REVISION_SELECT = 'id,evaluation_id,revision_number,supersedes_revision_id,policy_id,status,evidence_snapshot,evidence_hash,frozen_snapshot,report_number,judgment_summary,strengths,risks_concerns,recommendations,evaluator_id,evaluator_name_snapshot,evaluator_position_snapshot,reviewer_id,reviewer_name_snapshot,reviewer_position_snapshot,approver_id,approver_name_snapshot,approver_position_snapshot,finalized_at,created_at,updated_at,bm_vendor_annual_evaluations!evaluation_id!inner(vendor_id,fiscal_year),bm_vendor_evaluation_policies(version,status)'

function toRevision(row: RecordRow): AnnualRevision {
  const one = <T,>(value: T | T[] | null | undefined): T => (Array.isArray(value) ? value[0] : value) as T
  const evaluation = one(row.bm_vendor_annual_evaluations as RecordRow | RecordRow[])
  const policy = one(row.bm_vendor_evaluation_policies as RecordRow | RecordRow[])
  return {
    id: asString(row.id),
    evaluationId: asString(row.evaluation_id),
    vendorId: asString(evaluation.vendor_id),
    fiscalYear: Number(evaluation.fiscal_year),
    revisionNumber: Number(row.revision_number),
    supersedesRevisionId: nullableString(row.supersedes_revision_id),
    policyId: asString(row.policy_id),
    policyVersion: asString(policy.version),
    policyStatus: asString(policy.status) as PolicyStatus,
    status: asString(row.status) === 'final' ? 'final' : 'draft',
    evidence: row.evidence_snapshot as Snapshot,
    evidenceHash: asString(row.evidence_hash),
    frozen: (row.frozen_snapshot ?? null) as Frozen | null,
    reportNumber: nullableString(row.report_number),
    summary: nullableString(row.judgment_summary),
    strengths: nullableString(row.strengths),
    risksConcerns: nullableString(row.risks_concerns),
    recommendations: nullableString(row.recommendations),
    evaluatorId: nullableString(row.evaluator_id),
    evaluatorName: nullableString(row.evaluator_name_snapshot),
    evaluatorPosition: nullableString(row.evaluator_position_snapshot),
    reviewerId: nullableString(row.reviewer_id),
    reviewerName: nullableString(row.reviewer_name_snapshot),
    reviewerPosition: nullableString(row.reviewer_position_snapshot),
    approverId: nullableString(row.approver_id),
    approverName: nullableString(row.approver_name_snapshot),
    approverPosition: nullableString(row.approver_position_snapshot),
    finalizedAt: nullableString(row.finalized_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  }
}

export async function listAnnualRevisions(vendorId: string): Promise<AnnualRevision[]> {
  const { data, error } = await getAdminClient().from('bm_vendor_annual_evaluation_revisions').select(REVISION_SELECT)
    .eq('bm_vendor_annual_evaluations.vendor_id', vendorId).order('created_at', { ascending: false }).limit(100)
  if (error) throw new HttpError(400, error.message)
  return ((data ?? []) as RecordRow[]).map(toRevision).sort((a, b) => b.fiscalYear - a.fiscalYear || b.revisionNumber - a.revisionNumber)
}

export async function getAnnualRevision(revisionId: string): Promise<AnnualRevision> {
  const { data, error } = await getAdminClient().from('bm_vendor_annual_evaluation_revisions').select(REVISION_SELECT).eq('id', revisionId).maybeSingle()
  if (error) throw new HttpError(400, error.message)
  if (!data) throw new HttpError(404, 'ไม่พบรายงานประเมิน')
  return toRevision(data as RecordRow)
}

/** Signature images are large and only the PDF needs them, so they are read separately from the normal record. */
export async function getRevisionSignatures(revisionId: string) {
  const { data, error } = await getAdminClient().from('bm_vendor_annual_evaluation_revisions').select('evaluator_signature,reviewer_signature,approver_signature').eq('id', revisionId).maybeSingle()
  if (error) throw new HttpError(400, error.message)
  if (!data) throw new HttpError(404, 'ไม่พบรายงานประเมิน')
  const row = data as RecordRow
  return { evaluator: nullableString(row.evaluator_signature), reviewer: nullableString(row.reviewer_signature), approver: nullableString(row.approver_signature) }
}

export async function createAnnualDraft(vendorId: string, fiscalYear: number, actor: BmActor) {
  return rpc<string>('create_bm_vendor_annual_evaluation_draft', { p_actor: actor.id, p_vendor: vendorId, p_fiscal_year: fiscalYear })
}

export async function saveAnnualDraft(revisionId: string, input: DraftInput, actor: BmActor) {
  await rpc('save_bm_vendor_annual_evaluation_draft', {
    p_actor: actor.id, p_revision: revisionId,
    p_data: {
      summary: input.summary, strengths: input.strengths, risksConcerns: input.risksConcerns, recommendations: input.recommendations,
      evaluatorId: input.evaluatorId || null, reviewerId: input.reviewerId || null, approverId: input.approverId || null,
    },
  })
}

export async function refreshAnnualDraft(revisionId: string, actor: BmActor) {
  await rpc('refresh_bm_vendor_annual_evaluation_draft', { p_actor: actor.id, p_revision: revisionId })
}

/** Saves the draft first so what the user sees is what gets frozen, then finalizes; returns the report number. */
export async function finalizeAnnual(revisionId: string, input: DraftInput, actor: BmActor) {
  await saveAnnualDraft(revisionId, input, actor)
  return rpc<string>('finalize_bm_vendor_annual_evaluation', { p_actor: actor.id, p_revision: revisionId })
}

// ---- Signers ------------------------------------------------------------------------------------------------------------

export async function listSigners(actor: BmActor): Promise<Signer[]> {
  return (await rpc<Signer[] | null>('list_bm_evaluation_signers', { p_actor: actor.id })) ?? []
}

/** The caller's own position and signature; nobody else's signature is ever returned by the app. */
export async function getMySigner(actor: BmActor) {
  const { data, error } = await getAdminClient().from('bm_user_signers').select('position_title,signature_png').eq('user_id', actor.id).maybeSingle()
  if (error) throw new HttpError(400, error.message)
  const row = (data ?? {}) as RecordRow
  return { position: nullableString(row.position_title), signature: nullableString(row.signature_png) }
}

export async function setUserPosition(userId: string, position: string, actor: BmActor) {
  await rpc('set_bm_user_position', { p_actor: actor.id, p_user: userId, p_position: position.trim() || null })
}

export async function saveMySignature(png: string, actor: BmActor) {
  await rpc('save_bm_user_signature', { p_actor: actor.id, p_png: png })
}

export async function clearMySignature(actor: BmActor) {
  await rpc('clear_bm_user_signature', { p_actor: actor.id })
}

/** Position titles for the admin user table. */
export async function listUserPositions(): Promise<Map<string, string>> {
  const { data, error } = await getAdminClient().from('bm_user_signers').select('user_id,position_title').not('position_title', 'is', null)
  if (error) throw new HttpError(400, error.message)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.user_id), asString(row.position_title)]))
}
