import 'server-only'

import type {
  ActiveLimit,
  AnalyteDataType,
  AnalyteScale,
  ConsumableKind,
  ConsumableScope,
  IqcAnalyte,
  IqcChart,
  IqcChartPoint,
  IqcControlPlan,
  IqcControlLot,
  IqcControlMaterial,
  IqcCorrectiveAction,
  IqcAlert,
  IqcAssignableUser,
  IqcInstrument,
  IqcLotChangeMarker,
  IqcRun,
  IqcSixSigmaRow,
  IqcSpec,
  IqcStockLotOption,
  IqcTeaSpec,
  IqcUncertaintyBudget,
  IqcUncertaintyComponent,
  IqcWorkspace,
  IqcBaseline,
  IqcBaselineCandidate,
  IqcBaselineReview,
  IqcBaselineReviewInput,
  IqcSetupHealth,
  TeaMode,
  Distribution,
  UncertaintySource,
} from '@/lib/iqc/types'
import { normalizeReviewFindings, validateCorrectiveAction, type CorrectiveActionDraft, type CorrectiveActionFields, type CorrectiveCorrectionOutcome, type CorrectiveErrorType } from '@/lib/corrective-actions'
import { LAB_LOCK_MIN_POINTS } from '@/lib/iqc/types'
import { calculateBaselineStats, evaluateVlScope, expectedNormalResult, type BaselineValue, type EvaluationAnalyte, type EvaluationBaseline } from '@/lib/iqc/baseline'
import { cv, evaluateLatest, evaluateLatestByPolicy, mean, sd, toStat, WESTGARD_RULES, type QcStatus, type WestgardPolicyProfile, type WestgardRule } from '@/lib/iqc/westgard'
import { normalizeTestSets, parseTestSets } from '@/lib/iqc/test-sets'
import { sigmaRating, sixSigma, teaPercent } from '@/lib/iqc/sixsigma'
import { combinedRelative, divisorFor, expandedRelative, pooledRsd, relativeStandardUncertainty, standardUncertainty } from '@/lib/iqc/uncertainty'
import type { BmActor } from '@/lib/bm/types'
import { bangkokDateKey, todayBangkok } from '@/lib/bm/rules'
import { writeAudit } from '@/lib/server/audit'
import { deleteEntityAttachments } from '@/lib/server/attachments'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>
const NO_REQUIRED_LEVEL = '__no_required_level__'
const CD4_ANALYTE_CODES = new Set(['%CD3', '%CD4', 'AbsCD3', 'AbsCD4'])

function fail(error: { message: string } | null, message = 'IQC database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}
function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}
function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}
function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
function nullableNumber(value: unknown) {
  return value == null || value === '' ? null : Number(value)
}
function eqaNumericValue(value: unknown) {
  const raw = asString(value).trim()
  // Values such as "<20 Copies/mL" are censored rather than exact numbers,
  // so they must not be made up into a numeric bias. Thousands separators are
  // accepted because EQA results are commonly entered as "1,040".
  if (!raw || /^[<>]/.test(raw)) return null
  const parsed = Number(raw.replace(/,/g, '').replace(/\s*(copies\/?ml|iu\/?ml)\s*$/i, ''))
  return Number.isFinite(parsed) ? parsed : null
}
function clean(value: string | null | undefined) {
  return value?.trim() || null
}
function isBelowLodNormal(analyte: IqcAnalyte | undefined) {
  return analyte?.dataType === 'qualitative' && /(?:HIV|HBV|HCV)-VL\s*\(Normal\)$/i.test(analyte.code)
}
function belowLodLimit(analyte: IqcAnalyte | undefined) {
  if (!analyte) return null
  if (/^HBV-VL\s*\(Normal\)$/i.test(analyte.code)) return 10
  if (/^HCV-VL\s*\(Normal\)$/i.test(analyte.code)) return 15
  return null
}
function isBelowLodResult(value: string | null | undefined, limit: number | null) {
  const actual = value?.trim() ?? ''
  if (/^(?:not\s*detected|negative|<\s*LOD)$/i.test(actual)) return true
  const match = actual.match(/^<\s*(\d+(?:\.\d+)?)\s*(?:copies\/?ml|iu\/?ml)?$/i)
  return Boolean(match && (limit == null || Number(match[1]) === limit))
}
function evaluateVlNormalResult(analyte: IqcAnalyte | undefined, value: string | null | undefined): QcStatus | null {
  if (!isBelowLodNormal(analyte)) return null
  const actual = clean(value)
  if (!actual) return 'not_evaluated'
  return isBelowLodResult(actual, belowLodLimit(analyte)) ? 'accepted' : 'rejected'
}
function assertAdmin(actor: BmActor) {
  // Staff and Admin intentionally share full IQC access. Assistant remains HPV-only,
  // and must be blocked here too so direct API calls cannot bypass the page/nav guard.
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
}

function assertAdminOnly(actor: BmActor) {
  if (actor.role !== 'Admin') throw new HttpError(403, 'Admin permission required')
}

async function assertLinkedIqcInstrument(instrumentId: string) {
  const normalizedId = instrumentId.trim()
  if (!normalizedId) throw new HttpError(400, 'ต้องเลือกเครื่องมือ IQC')
  const admin = getAdminClient()
  const [{ data: instrument, error: instrumentError }, { data: link, error: linkError }] = await Promise.all([
    admin.from('iqc_instruments').select('id,is_active').eq('id', normalizedId).maybeSingle(),
    admin.from('bm_equipment_module_links').select('equipment_id').eq('module', 'iqc').eq('entity_type', 'instrument').eq('entity_id', normalizedId).maybeSingle(),
  ])
  fail(instrumentError)
  fail(linkError)
  if (!instrument || !Boolean((instrument as RecordRow).is_active)) throw new HttpError(400, 'เครื่องมือ IQC นี้ไม่พร้อมใช้งาน')
  const equipmentId = nullableString((link as RecordRow | null)?.equipment_id)
  if (!equipmentId) throw new HttpError(400, 'เครื่องมือ IQC นี้ยังไม่ได้เชื่อมกับ Equipment — ให้เชื่อมจากหน้า Equipment ก่อน')
  const { data: equipment, error: equipmentError } = await admin.from('bm_equipment').select('id,status').eq('id', equipmentId).maybeSingle()
  fail(equipmentError)
  if (!equipment) throw new HttpError(400, 'ไม่พบ Equipment ที่เชื่อมกับเครื่องมือ IQC')
  if (asString((equipment as RecordRow).status) === 'decommissioned') throw new HttpError(400, 'Equipment นี้เลิกใช้งานแล้ว จึงไม่สามารถใช้บันทึก IQC ได้')
  return equipmentId
}

async function assertUsableControlLots(lotIds: string[]) {
  const ids = [...new Set(lotIds.filter(Boolean))]
  const { data, error } = await getAdminClient()
    .from('iqc_control_lots')
    .select('id,lot_number,is_active,expiry_date')
    .in('id', ids)
  fail(error)
  const lots = new Map(((data ?? []) as RecordRow[]).map((lot) => [asString(lot.id), lot]))
  const today = todayBangkok()
  for (const id of ids) {
    const lot = lots.get(id)
    if (!lot) throw new HttpError(404, 'ไม่พบ Control lot')
    const lotNumber = asString(lot.lot_number)
    if (!Boolean(lot.is_active)) throw new HttpError(400, `Control lot ${lotNumber} ถูกปิดแล้ว`)
    const expiryDate = nullableString(lot.expiry_date)
    if (expiryDate && expiryDate < today) throw new HttpError(400, `Control lot ${lotNumber} หมดอายุแล้ว`)
  }
}

async function countIqcReferences(table: string, column: string, id: string) {
  const { count, error } = await getAdminClient()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, id)
  fail(error)
  return count ?? 0
}

async function assertNoIqcReferences(refs: { table: string; column: string }[], id: string, message: string) {
  for (const ref of refs) {
    if ((await countIqcReferences(ref.table, ref.column, id)) > 0) throw new HttpError(409, message)
  }
}

async function getNameMap(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string>()
  const { data, error } = await getAdminClient().from('nipt_users').select('id,display_name').in('id', ids)
  fail(error)
  return new Map(((data ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.display_name)]))
}

function mapAnalyte(row: RecordRow): IqcAnalyte {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    dataType: asString(row.data_type) as AnalyteDataType,
    scale: asString(row.scale) as AnalyteScale,
    isAbsolute: Boolean(row.is_absolute),
    unit: nullableString(row.unit),
    groupLabel: nullableString(row.group_label),
    isActive: Boolean(row.is_active),
  }
}
function mapInstrument(row: RecordRow): IqcInstrument {
  return {
    id: asString(row.id), code: asString(row.code), name: asString(row.name), model: nullableString(row.model), isActive: Boolean(row.is_active),
    equipmentId: null, equipmentCode: null, equipmentName: null, equipmentStatus: null,
  }
}
function mapMaterial(row: RecordRow): IqcControlMaterial {
  return {
    id: asString(row.id),
    name: asString(row.name),
    level: nullableString(row.level),
    manufacturer: nullableString(row.manufacturer),
    stockItemId: nullableString(row.stock_item_id),
    isActive: Boolean(row.is_active),
  }
}
function mapSpec(row: RecordRow): IqcSpec {
  return {
    id: asString(row.id),
    controlLotId: asString(row.control_lot_id),
    analyteId: asString(row.analyte_id),
    assignedMean: nullableNumber(row.assigned_mean),
    assignedSd: nullableNumber(row.assigned_sd),
    labMean: nullableNumber(row.lab_mean),
    labSd: nullableNumber(row.lab_sd),
    labN: row.lab_n == null ? null : Number(row.lab_n),
    labLockedAt: nullableString(row.lab_locked_at),
    activeLimit: asString(row.active_limit) as ActiveLimit,
    expectedQualitative: nullableString(row.expected_qualitative),
    manufacturerLower: nullableNumber(row.manufacturer_lower),
    manufacturerUpper: nullableNumber(row.manufacturer_upper),
    manufacturerPrecisionSd: nullableNumber(row.manufacturer_precision_sd),
    manufacturerTargetMean: nullableNumber(row.manufacturer_target_mean),
    manufacturerTargetSd: nullableNumber(row.manufacturer_target_sd),
    manufacturerSourceRef: nullableString(row.manufacturer_source_ref),
  }
}

function mapBaseline(row: RecordRow): IqcBaseline {
  return {
    id: asString(row.id),
    controlLotId: asString(row.control_lot_id),
    analyteId: asString(row.analyte_id),
    instrumentId: asString(row.instrument_id),
    baselineType: asString(row.baseline_type) as IqcBaseline['baselineType'],
    state: asString(row.state) as IqcBaseline['state'],
    mean: nullableNumber(row.mean),
    sd: nullableNumber(row.sd),
    n: Number(row.n ?? 0),
    expectedQualitative: nullableString(row.expected_qualitative),
    candidateN: Number(row.candidate_n ?? 0),
    excludedN: Number(row.excluded_n ?? 0),
    sourceRef: nullableString(row.source_ref),
    reason: nullableString(row.reason),
    version: Number(row.version ?? 0),
    createdBy: nullableString(row.created_by),
    createdAt: asString(row.created_at),
    approvedBy: nullableString(row.approved_by),
    approvedAt: nullableString(row.approved_at),
  }
}

function mapBaselineCandidate(row: RecordRow): IqcBaselineCandidate {
  return {
    id: asString(row.id),
    baselineId: asString(row.baseline_id),
    resultId: asString(row.result_id),
    included: Boolean(row.included),
    exclusionReason: nullableString(row.exclusion_reason),
  }
}

function hasLockedLabStats(spec: IqcSpec | undefined) {
  return Boolean(spec?.labLockedAt && spec.labMean != null && spec.labSd != null)
}

async function stockLotLabels(stockLotIds: string[]) {
  const ids = [...new Set(stockLotIds.filter(Boolean))]
  if (!ids.length) return new Map<string, { lotNumber: string; expiryDate: string | null }>()
  const { data, error } = await getAdminClient().from('bm_stock_lots').select('id,lot_number,expiry_date').in('id', ids)
  fail(error)
  const rows = (data ?? []) as RecordRow[]
  if (rows.length !== ids.length) throw new HttpError(400, 'ไม่พบ lot ที่เลือกในคลัง')
  return new Map(rows.map((row) => [asString(row.id), { lotNumber: asString(row.lot_number), expiryDate: nullableString(row.expiry_date) }]))
}

function activeStats(spec: IqcSpec | undefined): { meanValue: number | null; sdValue: number | null } {
  if (!spec) return { meanValue: null, sdValue: null }
  if (spec.activeLimit === 'baseline') return { meanValue: null, sdValue: null }
  if (spec.activeLimit === 'lab' && hasLockedLabStats(spec)) return { meanValue: spec.labMean, sdValue: spec.labSd }
  return { meanValue: spec.assignedMean, sdValue: spec.assignedSd }
}

function isVlAnalyte(analyte: Pick<IqcAnalyte, 'code'> | undefined) {
  return Boolean(analyte && /-VL\b/i.test(analyte.code))
}

function isQuantitativeVlAnalyte(analyte: Pick<IqcAnalyte, 'code' | 'dataType'> | undefined) {
  return Boolean(analyte && analyte.dataType === 'quantitative' && isVlAnalyte(analyte))
}

function isNormalControlLevel(level: unknown) {
  return typeof level === 'string' && level.trim().toLowerCase() === 'normal'
}

function isCd4Analyte(analyte: Pick<IqcAnalyte, 'code'> | undefined) {
  return Boolean(analyte && CD4_ANALYTE_CODES.has(analyte.code))
}

async function resolveCd4RunInstrumentId(analyteIds: string[], requestedInstrumentId: string) {
  const admin = getAdminClient()
  const [{ data: analyteRows, error: analyteError }, { data: planRows, error: planError }] = await Promise.all([
    admin.from('iqc_analytes').select('id,code').in('id', analyteIds),
    admin.from('iqc_control_plans').select('instrument_id').in('analyte_id', analyteIds).eq('is_active', true),
  ])
  fail(analyteError)
  fail(planError)
  const rows = (analyteRows ?? []) as RecordRow[]
  const isCd4Only = rows.length === analyteIds.length && rows.length > 0 && rows.every((row) => isCd4Analyte({ code: asString(row.code) }))
  if (!isCd4Only) return requestedInstrumentId
  const targetIds = [...new Set(((planRows ?? []) as RecordRow[]).map((row) => asString(row.instrument_id)).filter(Boolean))]
  return targetIds.length === 1 ? targetIds[0] : requestedInstrumentId
}

function policyProfileFor(analyte: IqcAnalyte | undefined, plan?: { policyProfile?: WestgardPolicyProfile | null } | null): WestgardPolicyProfile {
  // The two profiles are domain contracts, not a free-form per-row toggle:
  // VL must never fall back to the CD4 evaluator and CD4 must remain legacy.
  // Keep the optional plan argument for API compatibility and future profiles.
  void plan
  return isVlAnalyte(analyte) ? 'vl-standard-v1' : 'cd4-legacy'
}

function buildSetupHealth(input: {
  analytes: IqcAnalyte[]
  instruments: IqcInstrument[]
  controlLots: IqcControlLot[]
  baselines: IqcBaseline[]
  charts: IqcChart[]
  observedVlScopes?: Set<string>
  controlPlans: IqcControlPlan[]
  teaSpecs: IqcTeaSpec[]
  uncertaintyBudgets: IqcUncertaintyBudget[]
}): IqcSetupHealth {
  const vlAnalytes = input.analytes.filter((analyte) => isQuantitativeVlAnalyte(analyte))
  const activeLots = input.controlLots.filter((lot) => lot.isActive)
  const baselineLots = activeLots.filter((lot) => !isNormalControlLevel(lot.level))
  const baselineApplicable = vlAnalytes.length > 0
  const approvedBaselineScopes = new Set(input.baselines.filter((baseline) => baseline.state === 'approved').map((baseline) => `${baseline.controlLotId}:${baseline.analyteId}:${baseline.instrumentId}`))
  const chartReviewScopes = input.charts
    .filter((chart) => isQuantitativeVlAnalyte(input.analytes.find((analyte) => analyte.id === chart.analyteId)) && chart.n >= 20)
    .map((chart) => `${chart.controlLotId}:${chart.analyteId}:${chart.instrumentId ?? ''}`)
  const observedReviewScopes = [...(input.observedVlScopes ?? new Set<string>())]
  const expectedReviewScopes = baselineLots.flatMap((lot) => input.instruments.flatMap((instrument) => vlAnalytes.map((analyte) => `${lot.id}:${analyte.id}:${instrument.id}`)))
  const baselineReviewCount = new Set([...expectedReviewScopes, ...chartReviewScopes, ...observedReviewScopes]
    .filter((scope) => !approvedBaselineScopes.has(scope))).size
  const activePlanCount = input.controlPlans.filter((plan) => plan.isActive).length
  const quantitativeVlCount = vlAnalytes.filter((analyte) => analyte.dataType === 'quantitative').length
  const teaCount = input.teaSpecs.filter((tea) => isQuantitativeVlAnalyte(input.analytes.find((analyte) => analyte.id === tea.analyteId))).length
  const uncertaintyCount = input.uncertaintyBudgets.filter((budget) => isQuantitativeVlAnalyte(input.analytes.find((analyte) => analyte.id === budget.analyteId))).length
  const tasks: IqcSetupHealth['tasks'] = [
    {
      key: 'equipment',
      dependencies: [],
      label: 'เชื่อมเครื่องมือ',
      description: 'ใช้ Equipment เป็นแหล่งข้อมูลหลักของเครื่องมือ IQC',
      state: input.instruments.length ? 'complete' : 'blocked',
      count: input.instruments.length,
      nextAction: input.instruments.length ? 'ตรวจสอบเครื่องมือที่เชื่อมแล้ว' : 'เชื่อมเครื่องมือจาก Equipment',
    },
    {
      key: 'analyte',
      dependencies: [],
      label: 'เพิ่ม analyte / ชุดทดสอบ',
      description: 'เพิ่ม assay และจัดกลุ่ม test set ก่อนกำหนดการรัน',
      state: input.analytes.some((analyte) => analyte.isActive) ? 'complete' : 'attention',
      count: input.analytes.filter((analyte) => analyte.isActive).length,
      nextAction: input.analytes.some((analyte) => analyte.isActive) ? 'ตรวจสอบ analyte ที่ใช้งานอยู่' : 'เพิ่ม analyte',
    },
    {
      key: 'lot',
      dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: input.instruments.length > 0 }],
      label: 'เพิ่ม Control lot',
      description: 'ผูก Material, lot และ stock ในงานเดียว',
      state: !input.instruments.length ? 'blocked' : activeLots.length ? 'complete' : 'blocked',
      count: activeLots.length,
      nextAction: activeLots.length ? 'ตรวจสอบ lot ที่ใช้งานอยู่' : 'เพิ่ม control lot ที่ยังใช้งานได้',
    },
    {
      key: 'baseline',
      dependencies: [
        { label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: input.instruments.length > 0 },
        { label: 'มี Control lot สำหรับ VL quantitative', done: !baselineApplicable || baselineLots.length > 0 },
      ],
      label: 'ตั้งค่าค่าอ้างอิงและ QC baseline',
      description: 'ทบทวนผลจริงก่อนใช้เป็นเกณฑ์ตัดสิน VL',
      state: !input.instruments.length ? 'blocked' : !baselineApplicable ? 'complete' : !baselineLots.length ? 'blocked' : baselineReviewCount ? 'attention' : 'complete',
      count: baselineReviewCount || quantitativeVlCount,
      nextAction: baselineReviewCount ? `ทบทวน ${baselineReviewCount} ระดับที่มีข้อมูลพร้อม` : !baselineApplicable ? 'ไม่ต้องตั้งค่า baseline สำหรับ VL Normal' : !baselineLots.length ? 'เพิ่ม Control lot สำหรับ VL quantitative' : 'ตรวจสอบ baseline ที่อนุมัติแล้ว',
    },
    {
      key: 'plan',
      dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: input.instruments.length > 0 }],
      label: 'กำหนดการรัน',
      description: 'กำหนดว่าเครื่องนี้ต้องรัน control อะไรและใช้ policy ใด',
      state: input.instruments.length && activePlanCount ? 'complete' : input.instruments.length ? 'attention' : 'blocked',
      count: activePlanCount,
      nextAction: activePlanCount ? 'ตรวจสอบชุดการรัน' : 'สร้างกำหนดการรัน',
    },
    {
      key: 'advanced',
      dependencies: [{ label: 'มี VL analyte ในระบบ', done: vlAnalytes.length > 0 }],
      label: 'เกณฑ์เพิ่มเติม',
      description: 'TEa, Six Sigma และ Uncertainty สำหรับการทบทวนเชิงลึก',
      state: teaCount || uncertaintyCount ? 'complete' : 'attention',
      count: teaCount + uncertaintyCount,
      nextAction: teaCount || uncertaintyCount ? 'ตรวจสอบค่าที่คำนวณแล้ว' : 'ตั้งค่า TEa หรือเปิดรายการที่ต้อง review',
    },
  ]
  return {
    tasks,
    readyCount: tasks.filter((task) => task.state === 'complete').length,
    attentionCount: tasks.filter((task) => task.state === 'attention').length,
    blockedCount: tasks.filter((task) => task.state === 'blocked').length,
  }
}

export async function getIqcWorkspace(actor: BmActor): Promise<IqcWorkspace> {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
  const admin = getAdminClient()
  const [
    { data: analyteData, error: analyteError },
    { data: instrumentData, error: instrumentError },
    { data: materialData, error: materialError },
    { data: lotData, error: lotError },
    { data: specData, error: specError },
    { data: baselineData, error: baselineError },
    { data: baselineCandidateData, error: baselineCandidateError },
    { data: runData, error: runError },
    { data: consumableData, error: consumableError },
    { data: valueData, error: valueError },
    { data: caData, error: caError },
    { data: teaData, error: teaError },
    { data: budgetData, error: budgetError },
    { data: planData, error: planError },
    { data: eqaBiasData, error: eqaBiasError },
    { data: userData, error: userError },
    { data: lockAuditData, error: lockAuditError },
    { data: equipmentLinkData, error: equipmentLinkError },
    { data: equipmentData, error: equipmentError },
    { data: stockLotData, error: stockLotError },
    { data: stockItemEquipmentLinkData, error: stockItemEquipmentLinkError },
  ] = await Promise.all([
    admin.from('iqc_analytes').select('*').order('group_label', { nullsFirst: true }).order('code'),
    admin.from('iqc_instruments').select('*').order('code'),
    admin.from('iqc_control_materials').select('*').order('name'),
    admin.from('iqc_control_lots').select('*').order('created_at', { ascending: false }),
    admin.from('iqc_control_specs').select('*'),
    admin.from('iqc_baselines').select('*').order('version', { ascending: false }),
    admin.from('iqc_baseline_candidates').select('*'),
    admin.from('iqc_runs').select('*').order('run_datetime', { ascending: false }).limit(500),
    admin.from('iqc_run_consumables').select('*'),
    admin.from('iqc_result_values').select('*').limit(5000),
    admin.from('iqc_corrective_actions').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('iqc_tea_specs').select('*').eq('is_active', true),
    admin.from('iqc_uncertainty_budgets').select('*, iqc_uncertainty_components(*)').order('evaluated_at', { ascending: false }),
    admin.from('iqc_control_plans').select('*').order('created_at'),
    admin.from('eqa_results').select('iqc_analyte_id,assigned_value,submitted_value,eqa_rounds(status,submission_date)').not('iqc_analyte_id', 'is', null),
    admin.from('nipt_users').select('id,display_name').order('display_name'),
    admin.from('bm_audit_logs').select('entity_id,actor_id,detail,created_at').eq('action', 'iqc.lot.lockAndClose').order('created_at', { ascending: false }),
    admin.from('bm_equipment_module_links').select('equipment_id,entity_id').eq('module', 'iqc').eq('entity_type', 'instrument'),
    admin.from('bm_equipment').select('id,code,name,model,status'),
    admin.from('bm_stock_lots').select('id,item_id,lot_number,expiry_date,bm_stock_items!inner(item_code,name,is_active,bm_stock_categories!inner(name))').eq('bm_stock_items.is_active', true).eq('bm_stock_items.bm_stock_categories.name', 'Reagent').order('created_at', { ascending: false }),
    admin.from('bm_stock_item_equipment_links').select('stock_item_id,equipment_id'),
  ])
  fail(analyteError)
  fail(instrumentError)
  fail(materialError)
  fail(lotError)
  fail(specError)
  fail(baselineError)
  fail(baselineCandidateError)
  fail(runError)
  fail(consumableError)
  fail(valueError)
  fail(caError)
  fail(teaError)
  fail(budgetError)
  fail(planError)
  fail(eqaBiasError)
  fail(userError)
  fail(lockAuditError)
  fail(equipmentLinkError)
  fail(equipmentError)
  fail(stockLotError)
  fail(stockItemEquipmentLinkError)

  const analytes = ((analyteData ?? []) as RecordRow[]).map(mapAnalyte)
  const allInstruments = ((instrumentData ?? []) as RecordRow[]).map(mapInstrument)
  const equipmentById = new Map(((equipmentData ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const equipmentIdByInstrument = new Map(((equipmentLinkData ?? []) as RecordRow[]).map((row) => [asString(row.entity_id), asString(row.equipment_id)]))
  for (const instrument of allInstruments) {
    const equipmentId = equipmentIdByInstrument.get(instrument.id)
    const equipment = equipmentId ? equipmentById.get(equipmentId) : undefined
    if (!equipmentId || !equipment) continue
    instrument.equipmentId = equipmentId
    instrument.equipmentCode = asString(equipment.code)
    instrument.equipmentName = asString(equipment.name)
    instrument.equipmentStatus = asString(equipment.status) as IqcInstrument['equipmentStatus']
    // Equipment is the single source of truth for the label shown in IQC.
    instrument.code = instrument.equipmentCode
    instrument.name = instrument.equipmentName
    instrument.model = nullableString(equipment.model)
  }
  // Legacy IQC instruments remain available for historical run lookups, but
  // new runs and control plans must use a registered, linked equipment item.
  // Keep the linked-record slice explicit: Equipment is the selector source,
  // while inactive/decommissioned records are removed from routine setup.
  const instruments = allInstruments.filter((instrument) => Boolean(instrument.equipmentId))
  const activeLinkedInstruments = instruments.filter((instrument) => instrument.isActive && instrument.equipmentStatus !== 'decommissioned')
  const controlMaterials = ((materialData ?? []) as RecordRow[]).map(mapMaterial)
  const equipmentIdsByStockItem = new Map<string, string[]>()
  for (const row of (stockItemEquipmentLinkData ?? []) as RecordRow[]) {
    const stockItemId = asString(row.stock_item_id)
    const equipmentId = asString(row.equipment_id)
    if (stockItemId && equipmentId) equipmentIdsByStockItem.set(stockItemId, [...(equipmentIdsByStockItem.get(stockItemId) ?? []), equipmentId])
  }
  const stockLots: IqcStockLotOption[] = ((stockLotData ?? []) as RecordRow[]).map((row) => {
    const item = row.bm_stock_items as RecordRow | null
    return { id: asString(row.id), itemCode: asString(item?.item_code), itemName: asString(item?.name), lotNumber: asString(row.lot_number), expiryDate: nullableString(row.expiry_date), equipmentIds: equipmentIdsByStockItem.get(asString(row.item_id)) ?? [] }
  })
  const materialMap = new Map(controlMaterials.map((m) => [m.id, m]))
  const lotRows = (lotData ?? []) as RecordRow[]
  const lockAuditByLotId = new Map<string, RecordRow>()
  for (const audit of (lockAuditData ?? []) as RecordRow[]) {
    const lotId = nullableString(audit.entity_id)
    if (lotId && !lockAuditByLotId.has(lotId)) lockAuditByLotId.set(lotId, audit)
  }
  const controlLots: IqcControlLot[] = lotRows.map((row) => {
    const material = materialMap.get(asString(row.control_material_id))
    return {
      id: asString(row.id),
      controlMaterialId: asString(row.control_material_id),
      controlMaterialName: material?.name ?? '-',
      level: material?.level ?? null,
      lotNumber: asString(row.lot_number),
      expiryDate: nullableString(row.expiry_date),
      stockLotId: nullableString(row.stock_lot_id),
      isActive: Boolean(row.is_active),
      lockedAt: null,
      lockedByName: null,
      lockOverrideReason: null,
    }
  })
  const lotMap = new Map(controlLots.map((lot) => [lot.id, lot]))
  const specs = ((specData ?? []) as RecordRow[]).map(mapSpec)
  const baselines = ((baselineData ?? []) as RecordRow[]).map(mapBaseline)
  const baselineCandidates = ((baselineCandidateData ?? []) as RecordRow[]).map(mapBaselineCandidate)
  const specByKey = new Map(specs.map((spec) => [`${spec.controlLotId}:${spec.analyteId}`, spec]))
  const approvedBaselineByScope = new Map(
    baselines
      .filter((baseline) => baseline.state === 'approved')
      .map((baseline) => [`${baseline.controlLotId}:${baseline.analyteId}:${baseline.instrumentId}`, baseline]),
  )
  const analyteMap = new Map(analytes.map((a) => [a.id, a]))
  const assignableUsers: IqcAssignableUser[] = ((userData ?? []) as RecordRow[]).map((row) => ({ id: asString(row.id), displayName: asString(row.display_name) }))
  const userNameMap = new Map(assignableUsers.map((user) => [user.id, user.displayName]))
  for (const lot of controlLots) {
    const audit = lockAuditByLotId.get(lot.id)
    if (!audit) continue
    const detail = audit.detail && typeof audit.detail === 'object' && !Array.isArray(audit.detail) ? audit.detail as RecordRow : {}
    lot.lockedAt = nullableString(audit.created_at)
    lot.lockedByName = userNameMap.get(asString(audit.actor_id)) ?? null
    lot.lockOverrideReason = nullableString(detail.overrideReason)
  }
  const controlPlans: IqcControlPlan[] = ((planData ?? []) as RecordRow[]).map((row) => {
    const analyte = analyteMap.get(asString(row.analyte_id))
    const instrument = allInstruments.find((item) => item.id === asString(row.instrument_id))
    return {
      id: asString(row.id),
      analyteId: asString(row.analyte_id),
      analyteCode: analyte?.code ?? '-',
      analyteName: analyte?.name ?? '-',
      instrumentId: asString(row.instrument_id),
      instrumentName: instrument?.name ?? '-',
      requiredLevels: Array.isArray(row.required_levels) ? (row.required_levels as string[]).filter((level) => level !== NO_REQUIRED_LEVEL) : [],
      frequency: asString(row.frequency) === 'per-run' ? 'per-run' : 'daily',
      westgardRules: parseWestgardRules(row.westgard_rules),
      policyProfile: asString(row.policy_profile) === 'vl-standard-v1' ? 'vl-standard-v1' : 'cd4-legacy',
      isActive: Boolean(row.is_active),
    }
  })

  const teaSpecs: IqcTeaSpec[] = ((teaData ?? []) as RecordRow[]).map((row) => {
    const analyte = analyteMap.get(asString(row.analyte_id))
    return {
      id: asString(row.id),
      analyteId: asString(row.analyte_id),
      analyteCode: analyte?.code ?? '-',
      analyteName: analyte?.name ?? '-',
      teaValue: Number(row.tea_value),
      teaMode: asString(row.tea_mode) as TeaMode,
      teaUnit: nullableString(row.tea_unit),
      sourceRef: nullableString(row.source_ref),
      isActive: Boolean(row.is_active),
    }
  })
  const teaByAnalyte = new Map(teaSpecs.map((tea) => [tea.analyteId, tea]))

  const uncertaintyBudgets: IqcUncertaintyBudget[] = ((budgetData ?? []) as RecordRow[]).map((row) => {
    const analyte = analyteMap.get(asString(row.analyte_id))
    const tea = teaByAnalyte.get(asString(row.analyte_id))
    const components: IqcUncertaintyComponent[] = ((row.iqc_uncertainty_components as RecordRow[] | null) ?? []).map((c) => ({
      id: asString(c.id),
      source: asString(c.source) as UncertaintySource,
      type: asString(c.type) === 'B' ? 'B' : 'A',
      label: nullableString(c.label),
      value: nullableNumber(c.value),
      distribution: asString(c.distribution) as Distribution,
      divisor: nullableNumber(c.divisor),
      concentration: nullableNumber(c.concentration),
      su: nullableNumber(c.su),
      rsu: nullableNumber(c.rsu),
    }))
    components.sort((a, b) => (a.source === 'iqc' ? -1 : b.source === 'iqc' ? 1 : 0))
    return {
      id: asString(row.id),
      analyteId: asString(row.analyte_id),
      analyteName: analyte?.name ?? '-',
      groupLabel: analyte?.groupLabel ?? null,
      analyteUnit: analyte?.unit ?? null,
      measurand: asString(row.measurand),
      concentration: Number(row.concentration),
      coverageK: Number(row.coverage_k),
      combinedUc: nullableNumber(row.combined_uc),
      expandedUx: nullableNumber(row.expanded_ux),
      iqcRsd: nullableNumber(row.iqc_rsd),
      iqcN: row.iqc_n == null ? null : Number(row.iqc_n),
      iqcLotCount: row.iqc_lot_count == null ? null : Number(row.iqc_lot_count),
      meetsRequirement: Boolean(row.meets_requirement),
      note: nullableString(row.note),
      evaluatedAt: asString(row.evaluated_at),
      validUntil: nullableString(row.valid_until),
      components,
      teaValue: tea?.teaValue ?? null,
      teaMode: tea?.teaMode ?? null,
    }
  })

  const runRows = (runData ?? []) as RecordRow[]
  const runDatetime = new Map(runRows.map((row) => [asString(row.id), asString(row.run_datetime)]))
  const runInstrument = new Map(runRows.map((row) => [asString(row.id), nullableString(row.instrument_id)]))
  const instrumentMap = new Map(allInstruments.map((i) => [i.id, i]))
  const consumableRows = (consumableData ?? []) as RecordRow[]
  const consumablesByRun = new Map<string, RecordRow[]>()
  for (const row of consumableRows) {
    const runId = asString(row.run_id)
    consumablesByRun.set(runId, [...(consumablesByRun.get(runId) ?? []), row])
  }
  const valueRows = (valueData ?? []) as RecordRow[]
  const nameMap = await getNameMap([
    ...runRows.map((r) => asString(r.entered_by)),
    ...((caData ?? []) as RecordRow[]).flatMap((r) => [asString(r.created_by), asString(r.closed_by), asString(r.owner_id), asString(r.effectiveness_verified_by)]),
  ])

  // CD4 is a legacy lot-level QC series. VL remains instrument-scoped because
  // its approved baseline is scoped by control lot + analyte + instrument.
  const groups = new Map<string, RecordRow[]>()
  for (const row of valueRows) {
    const analyte = analyteMap.get(asString(row.analyte_id))
    const instrumentToken = isCd4Analyte(analyte) ? 'cd4-lot' : runInstrument.get(asString(row.run_id)) ?? 'unassigned'
    const key = `${asString(row.control_lot_id)}:${asString(row.analyte_id)}:${instrumentToken}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const charts: IqcChart[] = []
  for (const [key, rows] of groups) {
    const [controlLotId, analyteId, instrumentToken] = key.split(':')
    const analyte = analyteMap.get(analyteId)
    const lot = lotMap.get(controlLotId)
    if (!analyte || !lot) continue
    // Negative / below-LOD viral-load controls are qualitative checks, not
    // Levey-Jennings data points.
    if (analyte.dataType === 'qualitative') continue
    const instrumentId = isCd4Analyte(analyte)
      ? controlPlans.find((plan) => plan.analyteId === analyteId && plan.isActive)?.instrumentId ?? null
      : instrumentToken === 'unassigned' ? null : instrumentToken
    const spec = specByKey.get(`${controlLotId}:${analyteId}`)
    const baseline = instrumentId ? approvedBaselineByScope.get(`${controlLotId}:${analyteId}:${instrumentId}`) ?? null : null
    const labStatisticsLocked = hasLockedLabStats(spec)
    const useVlBaseline = isVlAnalyte(analyte) && baseline?.state === 'approved'
    const vlWithoutBaseline = isQuantitativeVlAnalyte(analyte) && !useVlBaseline
    const { meanValue, sdValue } = useVlBaseline
      ? { meanValue: baseline?.mean ?? null, sdValue: baseline?.sd ?? null }
      : vlWithoutBaseline
        ? { meanValue: null, sdValue: null }
        : activeStats(spec)

    const ordered = rows
      .map((row) => ({ row, when: runDatetime.get(asString(row.run_id)) ?? asString(row.created_at) }))
      .sort((a, b) => a.when.localeCompare(b.when))

    const points: IqcChartPoint[] = ordered.map(({ row, when }) => ({
      resultId: asString(row.id),
      runId: asString(row.run_id),
      runDatetime: when,
      value: Number(row.numeric_value ?? 0),
      statValue: Number(row.stat_value ?? row.numeric_value ?? 0),
      z: vlWithoutBaseline ? null : nullableNumber(row.z_score),
      status: vlWithoutBaseline ? 'not_evaluated' : asString(row.status) as QcStatus,
      violatedRules: vlWithoutBaseline ? [] : Array.isArray(row.violated_rules) ? (row.violated_rules as string[]) : [],
      isVoided: Boolean(row.is_voided),
    }))

    const usable = points.filter((p) => !p.isVoided).map((p) => p.statValue)
    // Same set the lock writes (getUsableLabValues): voided and rejected points
    // never contribute to a lab mean/SD, so the running value shown before the
    // lock matches what "Lock & ปิด Lot" would store.
    const labUsable = points.filter((p) => !p.isVoided && p.status !== 'rejected').map((p) => p.statValue)
    const lockEligible = labUsable.length >= LAB_LOCK_MIN_POINTS
    const latest = [...points].reverse().find((p) => !p.isVoided)
    const legacyDisplay: {
      activeLimit: Exclude<ActiveLimit, 'baseline'>
      labMean: number | null
      labSd: number | null
      labN: number | null
    } = {
      // Keep the CD4 LAB lock contract explicit. VL never uses this fallback
      // as its active limit until an approved QC baseline exists.
      activeLimit: spec?.activeLimit === 'lab' && labStatisticsLocked ? 'lab' : 'assigned',
      labMean: labStatisticsLocked ? spec?.labMean ?? null : null,
      labSd: labStatisticsLocked ? spec?.labSd ?? null : null,
      labN: labStatisticsLocked ? spec?.labN ?? null : null,
    }

    // Lot-change annotations relevant to this analyte (Trucount only on absolute analytes)
    const lotChanges: IqcLotChangeMarker[] = []
    const seenByKind = new Map<string, string>()
    for (const { row, when } of ordered) {
      for (const cons of consumablesByRun.get(asString(row.run_id)) ?? []) {
        const scope = asString(cons.applies_scope) as ConsumableScope
        if (scope === 'absolute-only' && !analyte.isAbsolute) continue
        const kind = asString(cons.kind)
        const lotNumber = asString(cons.lot_number)
        const prev = seenByKind.get(kind)
        if (prev !== undefined && prev !== lotNumber) {
          lotChanges.push({ runDatetime: when, kind: kind as ConsumableKind, lotNumber })
        }
        seenByKind.set(kind, lotNumber)
      }
    }
    const currentConsumables = [...seenByKind.entries()].map(([kind, lotNumber]) => ({ kind: kind as ConsumableKind, lotNumber }))

    charts.push({
      key,
      controlLotId,
      analyteId,
      instrumentId,
      instrumentName: instrumentId ? instrumentMap.get(instrumentId)?.name ?? null : null,
      analyteCode: analyte.code,
      analyteName: analyte.name,
      groupLabel: analyte.groupLabel,
      scale: analyte.scale,
      dataType: analyte.dataType,
      unit: analyte.unit,
      level: lot.level,
      controlMaterialName: lot.controlMaterialName,
      lotNumber: lot.lotNumber,
      activeLimit: useVlBaseline ? 'baseline' : isVlAnalyte(analyte) ? 'assigned' : legacyDisplay.activeLimit,
      policyProfile: policyProfileFor(analyte, controlPlans.find((plan) => plan.analyteId === analyteId && plan.instrumentId === instrumentId)),
      baselineId: baseline?.id ?? null,
      baselineState: baseline?.state ?? null,
      baselineType: baseline?.baselineType ?? null,
      baselineVersion: baseline?.version ?? null,
      baselineCandidateN: baseline?.candidateN ?? null,
      manufacturerLower: spec?.manufacturerLower ?? null,
      manufacturerUpper: spec?.manufacturerUpper ?? null,
      manufacturerPrecisionSd: spec?.manufacturerPrecisionSd ?? null,
      manufacturerTargetMean: spec?.manufacturerTargetMean ?? null,
      manufacturerTargetSd: spec?.manufacturerTargetSd ?? null,
      manufacturerSourceRef: spec?.manufacturerSourceRef ?? null,
      mean: meanValue,
      sd: sdValue,
      cv: meanValue && sdValue ? (sdValue / Math.abs(meanValue)) * 100 : null,
      n: usable.length,
      assignedMean: spec?.assignedMean ?? null,
      assignedSd: spec?.assignedSd ?? null,
      labMean: useVlBaseline ? baseline?.mean ?? null : legacyDisplay.labMean,
      labSd: useVlBaseline ? baseline?.sd ?? null : legacyDisplay.labSd,
      labN: useVlBaseline ? baseline?.n ?? null : legacyDisplay.labN,
      labLockedAt: spec?.labLockedAt ?? null,
      runningLabMean: lockEligible ? mean(labUsable) : null,
      runningLabSd: lockEligible ? sd(labUsable) : null,
      runningLabN: labUsable.length,
      lockEligible,
      status: vlWithoutBaseline ? 'not_evaluated' : latest?.status ?? 'accepted',
      points,
      lotChanges,
      currentConsumables,
    })
  }
  charts.sort((a, b) => {
    const rank: Record<QcStatus, number> = { rejected: 0, investigate: 1, warning: 2, not_evaluated: 3, accepted: 4 }
    return rank[a.status] - rank[b.status] || a.analyteCode.localeCompare(b.analyteCode)
  })

  // ---- Six Sigma rows. Bias is the mean signed percentage bias from completed EQA rounds. ----
  const eqaBiasByTestSet = new Map<string, { values: number[]; dates: string[] }>()
  for (const row of (eqaBiasData ?? []) as RecordRow[]) {
    const round = row.eqa_rounds as RecordRow | null
    const status = asString(round?.status)
    const assignedRaw = eqaNumericValue(row.assigned_value)
    const submittedRaw = eqaNumericValue(row.submitted_value)
    const analyteId = nullableString(row.iqc_analyte_id)
    const linkedAnalyte = analyteId ? analyteMap.get(analyteId) : null
    if (!linkedAnalyte || !assignedRaw || submittedRaw == null || !['evaluated', 'closed'].includes(status)) continue
    // Viral-load EQA: the laboratory submits Copies/mL, while the provider's
    // assigned value is already reported as log10. Convert only our submitted
    // value so both sides of the bias calculation are on the same scale.
    const assigned = assignedRaw
    const submitted = toStat(submittedRaw, linkedAnalyte.scale)
    for (const testSet of parseTestSets(linkedAnalyte.groupLabel)) {
      const entry = eqaBiasByTestSet.get(testSet) ?? { values: [], dates: [] }
      entry.values.push(((submitted - assigned) / Math.abs(assigned)) * 100)
      const date = nullableString(round?.submission_date)
      if (date) entry.dates.push(date)
      eqaBiasByTestSet.set(testSet, entry)
    }
  }
  const sixSigmaRows: IqcSixSigmaRow[] = []
  for (const chart of charts) {
    const tea = teaByAnalyte.get(chart.analyteId)
    if (!tea || chart.dataType === 'qualitative') continue
    const teaPct = chart.mean != null ? teaPercent(tea.teaValue, tea.teaMode, chart.mean) : null
    const eqaBias = parseTestSets(chart.groupLabel).map((testSet) => eqaBiasByTestSet.get(testSet)).find(Boolean)
    // Sigma is only meaningful with a verified EQA bias. Do not silently
    // treat an unlinked/missing EQA result as zero bias.
    const biasPct = eqaBias?.values.length ? mean(eqaBias.values) : null
    const sigma = teaPct != null && chart.cv != null && biasPct != null ? sixSigma(teaPct, biasPct, chart.cv) : null
    sixSigmaRows.push({
      key: chart.key,
      analyteCode: chart.analyteCode,
      analyteName: chart.analyteName,
      groupLabel: chart.groupLabel,
      level: chart.level,
      lotNumber: chart.lotNumber,
      meanValue: chart.mean,
      cv: chart.cv,
      biasPct,
      biasSampleCount: eqaBias?.values.length ?? 0,
      biasPeriod: eqaBias?.dates.length ? `${eqaBias.dates.sort()[0]} – ${eqaBias.dates.sort().at(-1)}` : null,
      teaValue: tea.teaValue,
      teaMode: tea.teaMode,
      teaPct,
      sigma,
      rating: sigmaRating(sigma),
    })
  }

  // ---- Runs (recent, with results + consumables) ----
  const valuesByRun = new Map<string, RecordRow[]>()
  for (const row of valueRows) {
    const runId = asString(row.run_id)
    valuesByRun.set(runId, [...(valuesByRun.get(runId) ?? []), row])
  }
  const runs: IqcRun[] = runRows.slice(0, 100).map((row) => {
    const id = asString(row.id)
    const instrument = row.instrument_id ? instrumentMap.get(asString(row.instrument_id)) : undefined
    return {
      id,
      instrumentId: nullableString(row.instrument_id),
      instrumentName: instrument?.name ?? null,
      runNo: row.run_no == null ? null : Number(row.run_no),
      runDatetime: asString(row.run_datetime),
      note: nullableString(row.note),
      enteredByName: nameMap.get(asString(row.entered_by)) ?? null,
      consumables: (consumablesByRun.get(id) ?? []).map((cons) => ({
        id: asString(cons.id),
        kind: asString(cons.kind) as ConsumableKind,
        lotNumber: asString(cons.lot_number),
        stockLotId: nullableString(cons.stock_lot_id),
        appliesScope: asString(cons.applies_scope) as ConsumableScope,
        beadCountPerTube: nullableNumber(cons.bead_count_per_tube),
      })),
      results: (valuesByRun.get(id) ?? []).map((value) => {
        const analyte = analyteMap.get(asString(value.analyte_id))
        const resultInstrumentId = runInstrument.get(id)
        const resultBaseline = isQuantitativeVlAnalyte(analyte) && resultInstrumentId
          ? approvedBaselineByScope.get(`${asString(value.control_lot_id)}:${asString(value.analyte_id)}:${resultInstrumentId}`) ?? null
          : null
        const vlWithoutBaseline = isQuantitativeVlAnalyte(analyte) && resultBaseline?.state !== 'approved'
        return {
          resultId: asString(value.id),
          analyteId: asString(value.analyte_id),
          analyteCode: analyte?.code ?? '-',
          analyteName: analyte?.name ?? '-',
          controlLotId: asString(value.control_lot_id),
          numericValue: nullableNumber(value.numeric_value),
          qualitativeValue: nullableString(value.qualitative_value),
          z: vlWithoutBaseline ? null : nullableNumber(value.z_score),
          violatedRules: vlWithoutBaseline ? [] : Array.isArray(value.violated_rules) ? (value.violated_rules as string[]) : [],
          status: vlWithoutBaseline ? 'not_evaluated' : asString(value.status) as QcStatus,
          isVoided: Boolean(value.is_voided),
          evaluationBaselineId: vlWithoutBaseline ? null : resultBaseline?.id ?? nullableString(value.evaluation_baseline_id),
        }
      }),
    }
  })

  const correctiveActions: IqcCorrectiveAction[] = ((caData ?? []) as RecordRow[]).map((row) => {
    const analyte = row.analyte_id ? analyteMap.get(asString(row.analyte_id)) : undefined
    return {
      id: asString(row.id),
      runId: asString(row.run_id),
      resultId: nullableString(row.result_id),
      runDatetime: runDatetime.get(asString(row.run_id)) ?? asString(row.created_at),
      analyteId: nullableString(row.analyte_id),
      analyteName: analyte?.name ?? null,
      problem: asString(row.problem),
      issueTypes: stringArray(row.issue_types),
      probableErrorType: row.probable_error_type === 'random' || row.probable_error_type === 'systematic' || row.probable_error_type === 'unknown' || row.probable_error_type === 'other' ? row.probable_error_type as CorrectiveErrorType : null,
      probableErrorNote: nullableString(row.probable_error_note),
      reviewFindings: normalizeReviewFindings(row.review_findings, 'iqc'),
      rootCause: nullableString(row.root_cause),
      actionTypes: stringArray(row.action_types),
      actionTaken: nullableString(row.action_taken),
      correctionOutcome: row.correction_outcome === 'corrected' || row.correction_outcome === 'not-corrected' || row.correction_outcome === 'monitoring' || row.correction_outcome === 'other' ? row.correction_outcome as CorrectiveCorrectionOutcome : null,
      correctionOutcomeNote: nullableString(row.correction_outcome_note),
      preventiveAction: nullableString(row.preventive_action),
      status: asString(row.status) === 'closed' ? 'closed' : asString(row.status) === 'awaiting-effectiveness' ? 'awaiting-effectiveness' : 'open',
      ownerId: nullableString(row.owner_id),
      ownerName: row.owner_id ? nameMap.get(asString(row.owner_id)) ?? userNameMap.get(asString(row.owner_id)) ?? null : null,
      dueDate: nullableString(row.due_date),
      effectivenessOutcome: asString(row.effectiveness_outcome) === 'effective' ? 'effective' : asString(row.effectiveness_outcome) === 'ineffective' ? 'ineffective' : 'pending',
      effectivenessNote: nullableString(row.effectiveness_note),
      effectivenessVerifiedByName: row.effectiveness_verified_by ? nameMap.get(asString(row.effectiveness_verified_by)) ?? userNameMap.get(asString(row.effectiveness_verified_by)) ?? null : null,
      effectivenessVerifiedAt: nullableString(row.effectiveness_verified_at),
      createdByName: nameMap.get(asString(row.created_by)) ?? null,
      createdAt: asString(row.created_at),
      closedByName: row.closed_by ? nameMap.get(asString(row.closed_by)) ?? null : null,
      closedAt: nullableString(row.closed_at),
    }
  })

  const today = todayBangkok()
  const alerts: IqcAlert[] = []
  for (const lot of controlLots) {
    if (!lot.isActive || !lot.expiryDate) continue
    const days = Math.round((new Date(`${lot.expiryDate}T00:00:00+07:00`).getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86_400_000)
    if (days >= 0 && days <= 30) alerts.push({ id: `lot:${lot.id}`, tone: 'warning', kind: 'lot-expiring', title: `Control lot ใกล้หมดอายุ: ${lot.lotNumber}`, detail: `เหลือ ${days} วัน` })
  }
  for (const chart of charts) {
    const recent = chart.points.filter((point) => !point.isVoided).slice(-3)
    if (recent.filter((point) => point.status === 'rejected').length >= 2) alerts.push({ id: `trend:${chart.key}`, tone: 'rejected', kind: 'rejected-trend', title: `Rejected trend: ${chart.analyteCode}`, detail: `${recent.filter((point) => point.status === 'rejected').length} จาก ${recent.length} run ล่าสุดถูก reject` })
    if (recent.filter((point) => point.status === 'investigate').length >= 2) alerts.push({ id: `investigate:${chart.key}`, tone: 'investigate', kind: 'investigate-trend', title: `ต้องเปิด investigation: ${chart.analyteCode}`, detail: `${recent.filter((point) => point.status === 'investigate').length} จาก ${recent.length} run ล่าสุดต้องตรวจสอบ` })
  }
  for (const plan of controlPlans.filter((item) => item.isActive && item.frequency === 'daily')) {
    const presentLevels = new Set(
      runs.filter((run) => run.instrumentId === plan.instrumentId && bangkokDateKey(run.runDatetime) === today)
        .flatMap((run) => run.results.filter((result) => result.analyteId === plan.analyteId).map((result) => lotMap.get(result.controlLotId)?.level))
        .filter((level): level is string => Boolean(level)),
    )
    const missing = plan.requiredLevels.filter((level) => !presentLevels.has(level))
    if (missing.length) alerts.push({ id: `plan:${plan.id}`, tone: 'warning', kind: 'control-due', title: `Control due: ${plan.analyteCode} · ${plan.instrumentName}`, detail: `ยังไม่รันระดับ ${missing.join(', ')} วันนี้` })
  }
  for (const action of correctiveActions) {
    if (action.status !== 'closed' && action.dueDate && action.dueDate < today) alerts.push({ id: `capa:${action.id}`, tone: 'rejected', kind: 'capa-overdue', title: 'CAPA เกินกำหนด', detail: `${action.problem} · ครบกำหนด ${action.dueDate}` })
  }

  const observedVlScopes = new Set(valueRows
    .filter((row) => !Boolean(row.is_voided) && isQuantitativeVlAnalyte(analyteMap.get(asString(row.analyte_id))))
    .map((row) => `${asString(row.control_lot_id)}:${asString(row.analyte_id)}:${runInstrument.get(asString(row.run_id)) ?? ''}`))
  const setupHealth = buildSetupHealth({ analytes, instruments: activeLinkedInstruments, controlLots, baselines, charts, observedVlScopes, controlPlans, teaSpecs, uncertaintyBudgets })

  return {
    analytes,
    instruments: activeLinkedInstruments,
    controlMaterials,
    controlLots,
    stockLots,
    specs,
    baselines,
    baselineCandidates,
    setupHealth,
    teaSpecs,
    controlPlans,
    alerts,
    assignableUsers,
    charts,
    sixSigma: sixSigmaRows,
    uncertaintyBudgets,
    runs,
    correctiveActions,
    summary: {
      chartCount: charts.length,
      inControl: charts.filter((c) => c.status === 'accepted').length,
      warning: charts.filter((c) => c.status === 'warning').length,
      rejected: charts.filter((c) => c.status === 'rejected').length,
      investigate: charts.filter((c) => c.status === 'investigate').length,
      notEvaluated: charts.filter((c) => c.status === 'not_evaluated').length,
      openCorrectiveActions: correctiveActions.filter((c) => c.status === 'open').length,
    },
  }
}

export async function getIqcSetupHealth(actor: BmActor): Promise<IqcSetupHealth> {
  const workspace = await getIqcWorkspace(actor)
  return workspace.setupHealth ?? buildSetupHealth({
    analytes: workspace.analytes,
    instruments: workspace.instruments,
    controlLots: workspace.controlLots,
    baselines: workspace.baselines ?? [],
    charts: workspace.charts,
    controlPlans: workspace.controlPlans,
    teaSpecs: workspace.teaSpecs,
    uncertaintyBudgets: workspace.uncertaintyBudgets,
  })
}

export async function resolveActiveIqcBaseline(actor: BmActor, input: Pick<IqcBaselineReviewInput, 'controlLotId' | 'analyteId' | 'instrumentId'>): Promise<IqcBaseline | null> {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
  await assertLinkedIqcInstrument(input.instrumentId)
  const admin = getAdminClient()
  const { data: analyteRow, error: analyteError } = await admin
    .from('iqc_analytes')
    .select('code,data_type')
    .eq('id', input.analyteId)
    .maybeSingle()
  fail(analyteError)
  const analyte = analyteRow as RecordRow | null
  if (!isQuantitativeVlAnalyte(analyte ? { code: asString(analyte.code), dataType: asString(analyte.data_type) as IqcAnalyte['dataType'] } : undefined)) return null
  const { data, error } = await admin
    .from('iqc_baselines')
    .select('*')
    .eq('control_lot_id', input.controlLotId)
    .eq('analyte_id', input.analyteId)
    .eq('instrument_id', input.instrumentId)
    .eq('state', 'approved')
    .order('version', { ascending: false })
    .limit(1)
  fail(error)
  return ((data ?? []) as RecordRow[])[0] ? mapBaseline(((data ?? []) as RecordRow[])[0]) : null
}

// ---------- VL baseline review / approval ----------

function baselineValueFromRow(row: RecordRow, analyteId: string): BaselineValue {
  const run = row.iqc_runs as RecordRow | null
  return {
    resultId: asString(row.id),
    runId: asString(row.run_id),
    runDatetime: asString(run?.run_datetime),
    analyteId,
    panel: null,
    numericValue: nullableNumber(row.numeric_value),
    statValue: nullableNumber(row.stat_value),
    qualitativeValue: nullableString(row.qualitative_value),
    currentStatus: asString(row.status) as QcStatus,
    currentZ: nullableNumber(row.z_score),
    isVoided: Boolean(row.is_voided),
  }
}

function baselineCandidateReason(row: BaselineValue, instrumentMatches: boolean, supplied?: string | null) {
  if (row.isVoided) return supplied?.trim() || 'ผลถูก void จึงไม่ใช้คำนวณ'
  if (!instrumentMatches) return supplied?.trim() || 'ผลนี้ไม่ตรงกับเครื่องมือที่เลือก'
  return supplied?.trim() || 'ไม่รวมในการทบทวน baseline — กรุณาระบุเหตุผล'
}

export async function getIqcBaselineReview(actor: BmActor, input: IqcBaselineReviewInput): Promise<IqcBaselineReview> {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
  const admin = getAdminClient()
  const [
    { data: analyteRow, error: analyteError },
    { data: lotRow, error: lotError },
    { data: instrumentRow, error: instrumentError },
    { data: specRow, error: specError },
    { data: planRow, error: planError },
    { data: baselineRows, error: baselineError },
    { data: valueRows, error: valueError },
  ] = await Promise.all([
    admin.from('iqc_analytes').select('*').eq('id', input.analyteId).maybeSingle(),
    admin.from('iqc_control_lots').select('id,lot_number,is_active,control_material_id,iqc_control_materials(level)').eq('id', input.controlLotId).maybeSingle(),
    admin.from('iqc_instruments').select('id,code,name,model,is_active').eq('id', input.instrumentId).maybeSingle(),
    admin.from('iqc_control_specs').select('*').eq('control_lot_id', input.controlLotId).eq('analyte_id', input.analyteId).maybeSingle(),
    admin.from('iqc_control_plans').select('westgard_rules,policy_profile').eq('analyte_id', input.analyteId).eq('instrument_id', input.instrumentId).eq('is_active', true).maybeSingle(),
    admin.from('iqc_baselines').select('*').eq('control_lot_id', input.controlLotId).eq('analyte_id', input.analyteId).eq('instrument_id', input.instrumentId).eq('state', 'approved').order('version', { ascending: false }).limit(1),
    admin.from('iqc_result_values').select('id,run_id,control_lot_id,analyte_id,numeric_value,stat_value,qualitative_value,z_score,status,is_voided,void_reason,iqc_runs(run_datetime,instrument_id)').eq('control_lot_id', input.controlLotId).eq('analyte_id', input.analyteId),
  ])
  fail(analyteError)
  fail(lotError)
  fail(instrumentError)
  fail(specError)
  fail(planError)
  fail(baselineError)
  fail(valueError)

  if (!analyteRow) throw new HttpError(404, 'ไม่พบ analyte ที่เลือก')
  if (!lotRow) throw new HttpError(404, 'ไม่พบ control lot ที่เลือก')
  if (!instrumentRow) throw new HttpError(404, 'ไม่พบเครื่องมือที่เลือก')
  await assertLinkedIqcInstrument(input.instrumentId)
  const analyte = mapAnalyte(analyteRow as RecordRow)
  if (!isQuantitativeVlAnalyte(analyte)) throw new HttpError(400, 'Baseline review รองรับเฉพาะ VL แบบ quantitative')
  const material = (lotRow as RecordRow).iqc_control_materials as RecordRow | null
  if (isNormalControlLevel(material?.level)) throw new HttpError(400, 'Control lot ระดับ Normal ไม่ต้องตั้งค่า baseline')
  const spec = specRow ? mapSpec(specRow as RecordRow) : undefined
  const instrument = instrumentRow as RecordRow
  const plan = planRow as RecordRow | null
  const policyProfile = policyProfileFor(analyte, plan ? { policyProfile: asString(plan.policy_profile) as WestgardPolicyProfile } : null)
  const rules = parseWestgardRules(plan?.westgard_rules)
  const allValues = ((valueRows ?? []) as RecordRow[])
    .map((row) => baselineValueFromRow(row, input.analyteId))
    .sort((a, b) => a.runDatetime.localeCompare(b.runDatetime) || a.resultId.localeCompare(b.resultId))
  const includedInput = input.includedResultIds ? new Set(input.includedResultIds) : null
  const eligibleValues = allValues.filter((value) => !value.isVoided && ((valueRows ?? []) as RecordRow[]).find((row) => asString(row.id) === value.resultId)?.iqc_runs && asString((((valueRows ?? []) as RecordRow[]).find((row) => asString(row.id) === value.resultId)?.iqc_runs as RecordRow | null)?.instrument_id) === input.instrumentId)
  const includedValues = eligibleValues.filter((value) => includedInput?.has(value.resultId) ?? true)
  const selectedNumbers = includedValues.map((value) => value.statValue).filter((value): value is number => value != null && Number.isFinite(value))
  const qualitativeValues = includedValues.filter((value) => Boolean(value.qualitativeValue?.trim()))
  const stats = analyte.dataType === 'quantitative' ? calculateBaselineStats(selectedNumbers, eligibleValues.length, eligibleValues.length - includedValues.length) : { mean: null, sd: null, n: qualitativeValues.length, candidateN: eligibleValues.length, excludedN: eligibleValues.length - includedValues.length }
  const expectedQualitative = analyte.dataType === 'qualitative'
    ? clean(spec?.expectedQualitative) ?? expectedNormalResult(qualitativeValues)
    : null
  const evaluationBaseline: EvaluationBaseline = {
    id: ((baselineRows ?? []) as RecordRow[])[0] ? asString(((baselineRows ?? []) as RecordRow[])[0].id) : null,
    analyteId: input.analyteId,
    mean: stats.mean,
    sd: stats.sd,
    expectedQualitative,
    policyProfile,
    rules,
  }
  const evaluations = evaluateVlScope({
    values: eligibleValues,
    analytes: new Map<string, EvaluationAnalyte>([[input.analyteId, { id: input.analyteId, code: analyte.code, dataType: analyte.dataType, panel: analyte.groupLabel }]]),
    baselines: new Map([[input.analyteId, evaluationBaseline]]),
    includedResultIds: new Set(includedValues.map((value) => value.resultId)),
  })
  const candidates: IqcBaselineReview['candidates'] = allValues.map((value) => {
    const evaluation = evaluations.get(value.resultId)
    const row = ((valueRows ?? []) as RecordRow[]).find((item) => asString(item.id) === value.resultId)
    const instrumentMatches = asString(((row?.iqc_runs as RecordRow | null)?.instrument_id)) === input.instrumentId
    const included = !value.isVoided && instrumentMatches && (includedInput?.has(value.resultId) ?? true)
    return {
      resultId: value.resultId,
      runId: value.runId,
      runDatetime: value.runDatetime,
      numericValue: value.numericValue,
      statValue: value.statValue,
      qualitativeValue: value.qualitativeValue,
      currentStatus: value.currentStatus,
      proposedStatus: included ? evaluation?.status ?? 'not_evaluated' : 'not_evaluated',
      currentZ: value.currentZ,
      proposedZ: included ? evaluation?.z ?? null : null,
      proposedRules: included ? evaluation?.violatedRules ?? [] : [],
      included,
      exclusionReason: included ? null : baselineCandidateReason(value, instrumentMatches, input.exclusionReasons?.[value.resultId]),
      isVoided: value.isVoided,
      eligibleForBaseline: !value.isVoided && instrumentMatches,
    }
  })
  const impact = { accepted: 0, warning: 0, investigate: 0, rejected: 0, not_evaluated: 0 }
  for (const candidate of candidates) impact[candidate.proposedStatus] += 1
  const currentBaseline = ((baselineRows ?? []) as RecordRow[])[0] ? mapBaseline(((baselineRows ?? []) as RecordRow[])[0]) : null
  const currentStats = currentBaseline
    ? { mean: currentBaseline.mean, sd: currentBaseline.sd, n: currentBaseline.n }
    : { mean: spec?.activeLimit === 'lab' ? spec.labMean : spec?.assignedMean ?? null, sd: spec?.activeLimit === 'lab' ? spec.labSd : spec?.assignedSd ?? null, n: spec?.activeLimit === 'lab' ? spec.labN ?? 0 : 0 }
  let blockedReason: string | null = null
  if (actor.role !== 'Admin') blockedReason = 'ต้องใช้สิทธิ์ Admin เพื่ออนุมัติและคำนวณทับประวัติ'
  else if (!Boolean((lotRow as RecordRow).is_active)) blockedReason = 'Control lot นี้ถูกปิดใช้งานแล้ว'
  else if (analyte.dataType === 'quantitative' && selectedNumbers.length !== includedValues.length) blockedReason = `ผลที่รวมต้องมีค่าตัวเลขที่ใช้คำนวณได้ครบทุกผล (ใช้ได้ ${selectedNumbers.length}/${includedValues.length} ผล)`
  else if (analyte.dataType === 'quantitative' && selectedNumbers.length < 20) blockedReason = `ต้องมีผลตัวเลขที่รวมอย่างน้อย 20 ผล (ตอนนี้ ${selectedNumbers.length} ผล)`
  else if (analyte.dataType === 'quantitative' && (stats.mean == null || stats.sd == null || stats.sd <= 0)) blockedReason = 'ยังคำนวณ mean/SD ที่ใช้งานได้ไม่ได้'
  else if (analyte.dataType === 'qualitative' && qualitativeValues.length !== includedValues.length) blockedReason = `ผล qualitative ที่รวมต้องมี observed result ครบทุกผล (ใช้ได้ ${qualitativeValues.length}/${includedValues.length} ผล)`
  else if (analyte.dataType === 'qualitative' && !includedValues.length) blockedReason = 'ยังไม่มีผล non-void ของเครื่องมือนี้สำหรับ seed expected result'
  else if (analyte.dataType === 'qualitative' && !expectedQualitative) blockedReason = 'ยังไม่มี expected result'
  if (analyte.dataType === 'qualitative' && !qualitativeValues.length && !blockedReason) blockedReason = 'qualitative baseline needs at least one observed non-void result'
  return {
    controlLotId: input.controlLotId,
    analyteId: input.analyteId,
    instrumentId: input.instrumentId,
    analyteCode: analyte.code,
    analyteName: analyte.name,
    level: nullableString(material?.level),
    lotNumber: asString((lotRow as RecordRow).lot_number),
    instrumentName: asString(instrument.name || instrument.code),
    dataType: analyte.dataType,
    scale: analyte.scale,
    policyProfile,
    manufacturerLower: spec?.manufacturerLower ?? null,
    manufacturerUpper: spec?.manufacturerUpper ?? null,
    manufacturerPrecisionSd: spec?.manufacturerPrecisionSd ?? null,
    manufacturerTargetMean: spec?.manufacturerTargetMean ?? null,
    manufacturerTargetSd: spec?.manufacturerTargetSd ?? null,
    manufacturerSourceRef: spec?.manufacturerSourceRef ?? null,
    currentMean: currentStats.mean,
    currentSd: currentStats.sd,
    currentN: currentStats.n,
    proposedMean: stats.mean,
    proposedSd: stats.sd,
    proposedN: stats.n,
    candidateN: eligibleValues.length,
    excludedN: eligibleValues.length - includedValues.length,
    expectedQualitative,
    baselineId: currentBaseline?.id ?? null,
    baselineState: currentBaseline?.state ?? null,
    baselineType: currentBaseline?.baselineType ?? null,
    canApply: !blockedReason,
    blockedReason,
    candidates,
    impact,
  }
}

export async function previewIqcBaseline(actor: BmActor, input: IqcBaselineReviewInput) {
  return getIqcBaselineReview(actor, input)
}

export async function applyIqcBaseline(input: IqcBaselineReviewInput, actor: BmActor) {
  assertAdminOnly(actor)
  const reason = clean(input.reason)
  if (!reason) throw new HttpError(400, 'ต้องระบุเหตุผลที่อนุมัติ baseline ใหม่')
  const review = await getIqcBaselineReview(actor, input)
  if (!review.canApply) throw new HttpError(400, review.blockedReason ?? 'Baseline ยังไม่พร้อมใช้งาน')
  const excluded = review.candidates.filter((candidate) => candidate.eligibleForBaseline && !candidate.included)
  for (const candidate of excluded) {
    if (!input.exclusionReasons?.[candidate.resultId]?.trim()) throw new HttpError(400, `กรุณาระบุเหตุผลที่ไม่รวมผล ${candidate.resultId}`)
  }
  const candidatePayload = review.candidates
    .filter((candidate) => candidate.eligibleForBaseline && candidate.runId)
    .map((candidate) => ({ result_id: candidate.resultId, included: candidate.included, exclusion_reason: candidate.included ? null : input.exclusionReasons?.[candidate.resultId]?.trim() ?? null }))
  const evaluationPayload = review.candidates
    .filter((candidate) => candidate.eligibleForBaseline && candidate.runId)
    .map((candidate) => ({ result_id: candidate.resultId, status: candidate.proposedStatus, z: candidate.proposedZ, violated_rules: candidate.proposedRules }))
  const lotEvaluations = await buildVlEvaluationPayload(review.controlLotId, {
    analyteId: review.analyteId,
    instrumentId: review.instrumentId,
    mean: review.proposedMean,
    sd: review.proposedSd,
    expectedQualitative: review.expectedQualitative,
    includedResultIds: new Set(review.candidates.filter((candidate) => candidate.eligibleForBaseline && candidate.included).map((candidate) => candidate.resultId)),
  })
  const { error } = await getAdminClient().rpc('apply_iqc_vl_baseline', {
    p_control_lot_id: review.controlLotId,
    p_analyte_id: review.analyteId,
    p_instrument_id: review.instrumentId,
    p_actor: actor.id,
    p_baseline_type: review.dataType === 'qualitative' ? 'observed_seed' : 'lab_observed',
    p_mean: review.proposedMean,
    p_sd: review.proposedSd,
    p_expected_qualitative: review.expectedQualitative,
    p_source_ref: clean(input.sourceRef) ?? review.manufacturerSourceRef ?? 'Observed laboratory QC data',
    p_reason: reason,
    p_candidates: candidatePayload,
    p_evaluations: evaluationPayload,
    p_lot_evaluations: lotEvaluations.map((evaluation) => ({
      result_id: evaluation.resultId,
      analyte_id: evaluation.analyteId,
      status: evaluation.status,
      z: evaluation.z,
      violated_rules: evaluation.violatedRules,
    })),
  })
  fail(error)
  // The RPC commits the selected baseline and the recalculated results for all
  // VL levels in this lot in one transaction. That keeps same-run R-4s and the
  // baseline approval/audit trail consistent if any database write fails.
  return getIqcWorkspace(actor)
}

// ---------- Master data (Admin) ----------

export async function createAnalyte(input: {
  code: string
  name: string
  dataType: AnalyteDataType
  scale: AnalyteScale
  isAbsolute?: boolean
  unit?: string | null
  groupLabel?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('iqc_analytes').insert({
    code: input.code.trim(),
    name: input.name.trim(),
    data_type: input.dataType,
    scale: input.dataType === 'qualitative' ? 'linear' : input.scale,
    is_absolute: Boolean(input.isAbsolute),
    unit: clean(input.unit),
    group_label: normalizeTestSets(input.groupLabel),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.analyte.create', 'iqc-analyte', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function updateAnalyte(id: string, input: {
  code?: string
  name?: string
  dataType?: AnalyteDataType
  scale?: AnalyteScale
  isAbsolute?: boolean
  unit?: string | null
  groupLabel?: string | null
  isActive?: boolean
}, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let targetDataType = input.dataType
  if (targetDataType === undefined && input.scale !== undefined) {
    const { data: existing, error } = await admin.from('iqc_analytes').select('data_type').eq('id', id).maybeSingle()
    fail(error)
    const existingDataType = asString((existing as RecordRow | null)?.data_type)
    targetDataType = existingDataType === 'qualitative' || existingDataType === 'quantitative' ? existingDataType : undefined
  }
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.dataType !== undefined) payload.data_type = input.dataType
  if (input.scale !== undefined || targetDataType === 'qualitative') payload.scale = targetDataType === 'qualitative' ? 'linear' : input.scale
  if (input.isAbsolute !== undefined) payload.is_absolute = Boolean(input.isAbsolute)
  if (input.unit !== undefined) payload.unit = clean(input.unit)
  if (input.groupLabel !== undefined) payload.group_label = normalizeTestSets(input.groupLabel)
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { error } = await admin.from('iqc_analytes').update(payload).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.analyte.update', 'iqc-analyte', id, input)
  return getIqcWorkspace(actor)
}

export async function createInstrument(input: { code: string; name: string; model?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('iqc_instruments').insert({
    code: input.code.trim(),
    name: input.name.trim(),
    model: clean(input.model),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.instrument.create', 'iqc-instrument', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function updateInstrument(id: string, input: { code?: string; name?: string; model?: string | null; isActive?: boolean }, actor: BmActor) {
  assertAdmin(actor)
  const payload: Record<string, unknown> = {}
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.model !== undefined) payload.model = clean(input.model)
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { error } = await getAdminClient().from('iqc_instruments').update(payload).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.instrument.update', 'iqc-instrument', id, input)
  return getIqcWorkspace(actor)
}

export async function createControlMaterial(input: {
  name: string
  level?: string | null
  manufacturer?: string | null
  stockItemId?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const { data, error } = await getAdminClient().from('iqc_control_materials').insert({
    name: input.name.trim(),
    level: clean(input.level),
    manufacturer: clean(input.manufacturer),
    stock_item_id: input.stockItemId || null,
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.material.create', 'iqc-control-material', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function updateControlMaterial(id: string, input: {
  name?: string
  level?: string | null
  manufacturer?: string | null
  stockItemId?: string | null
  isActive?: boolean
}, actor: BmActor) {
  assertAdmin(actor)
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.level !== undefined) payload.level = clean(input.level)
  if (input.manufacturer !== undefined) payload.manufacturer = clean(input.manufacturer)
  if (input.stockItemId !== undefined) payload.stock_item_id = input.stockItemId || null
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { error } = await getAdminClient().from('iqc_control_materials').update(payload).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.material.update', 'iqc-control-material', id, input)
  return getIqcWorkspace(actor)
}

export async function createControlLot(input: {
  controlMaterialId: string
  lotNumber: string
  expiryDate?: string | null
  stockLotId?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const stockLot = input.stockLotId ? (await stockLotLabels([input.stockLotId])).get(input.stockLotId) : undefined
  const { data, error } = await getAdminClient().from('iqc_control_lots').insert({
    control_material_id: input.controlMaterialId,
    lot_number: stockLot?.lotNumber ?? input.lotNumber.trim(),
    expiry_date: stockLot?.expiryDate ?? (input.expiryDate || null),
    stock_lot_id: input.stockLotId || null,
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.lot.create', 'iqc-control-lot', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function updateControlLot(id: string, input: { controlMaterialId?: string; lotNumber?: string; expiryDate?: string | null; stockLotId?: string | null; isActive?: boolean }, actor: BmActor) {
  assertAdmin(actor)
  const payload: Record<string, unknown> = {}
  const stockLot = input.stockLotId ? (await stockLotLabels([input.stockLotId])).get(input.stockLotId) : undefined
  if (input.controlMaterialId !== undefined) payload.control_material_id = input.controlMaterialId
  if (input.lotNumber !== undefined) payload.lot_number = stockLot?.lotNumber ?? input.lotNumber.trim()
  if (input.expiryDate !== undefined) payload.expiry_date = stockLot?.expiryDate ?? (input.expiryDate || null)
  if (input.stockLotId !== undefined) payload.stock_lot_id = input.stockLotId || null
  if (stockLot && input.lotNumber === undefined) payload.lot_number = stockLot.lotNumber
  if (stockLot && input.expiryDate === undefined) payload.expiry_date = stockLot.expiryDate
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { error } = await getAdminClient().from('iqc_control_lots').update(payload).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.lot.update', 'iqc-control-lot', id, input)
  return getIqcWorkspace(actor)
}

const IQC_ENTITY = { analyte: 'iqc_analytes', instrument: 'iqc_instruments', material: 'iqc_control_materials' } as const
const IQC_DELETE_MESSAGE = 'รายการนี้มีข้อมูลอ้างอิงใน IQC/Lot verification แล้ว ให้ปิดใช้งานแทนการลบ'

export async function setIqcEntityActive(entity: keyof typeof IQC_ENTITY, id: string, isActive: boolean, actor: BmActor) {
  assertAdmin(actor)
  const { error } = await getAdminClient().from(IQC_ENTITY[entity]).update({ is_active: isActive }).eq('id', id)
  fail(error)
  await writeAudit(actor, `iqc.${entity}.setActive`, `iqc-${entity}`, id, { isActive })
  return getIqcWorkspace(actor)
}

export async function deleteIqcEntity(entity: keyof typeof IQC_ENTITY, id: string, actor: BmActor) {
  assertAdmin(actor)
  if (entity === 'analyte') {
    await assertNoIqcReferences([
      { table: 'iqc_control_specs', column: 'analyte_id' },
      { table: 'iqc_baselines', column: 'analyte_id' },
      { table: 'iqc_result_values', column: 'analyte_id' },
      { table: 'iqc_corrective_actions', column: 'analyte_id' },
      { table: 'iqc_tea_specs', column: 'analyte_id' },
      { table: 'iqc_uncertainty_budgets', column: 'analyte_id' },
      { table: 'lotverif_measurements', column: 'analyte_id' },
      { table: 'lotverif_verifications', column: 'parallel_analyte_id' },
    ], id, IQC_DELETE_MESSAGE)
  } else if (entity === 'instrument') {
    await assertNoIqcReferences([
      { table: 'iqc_runs', column: 'instrument_id' },
      { table: 'iqc_baselines', column: 'instrument_id' },
    ], id, IQC_DELETE_MESSAGE)
  } else {
    await assertNoIqcReferences([{ table: 'iqc_control_lots', column: 'control_material_id' }], id, IQC_DELETE_MESSAGE)
  }

  const { error } = await getAdminClient().from(IQC_ENTITY[entity]).delete().eq('id', id)
  fail(error)
  await writeAudit(actor, `iqc.${entity}.delete`, `iqc-${entity}`, id, {})
  return getIqcWorkspace(actor)
}

export async function deleteControlLot(id: string, actor: BmActor) {
  assertAdmin(actor)
  await assertNoIqcReferences([
    { table: 'iqc_control_specs', column: 'control_lot_id' },
    { table: 'iqc_baselines', column: 'control_lot_id' },
    { table: 'iqc_result_values', column: 'control_lot_id' },
    { table: 'lotverif_verifications', column: 'new_control_lot_id' },
    { table: 'lotverif_verifications', column: 'old_control_lot_id' },
    { table: 'lotverif_parallel_rows', column: 'control_lot_id' },
  ], id, IQC_DELETE_MESSAGE)
  const { error } = await getAdminClient().from('iqc_control_lots').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.lot.delete', 'iqc-control-lot', id, {})
  return getIqcWorkspace(actor)
}

export async function upsertSpec(input: {
  controlLotId: string
  analyteId: string
  assignedMean?: number | null
  assignedSd?: number | null
  expectedQualitative?: string | null
  changeReason?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_control_specs')
    .select('id,assigned_mean,assigned_sd,expected_qualitative')
    .eq('control_lot_id', input.controlLotId)
    .eq('analyte_id', input.analyteId)
    .maybeSingle()
  fail(existingError)
  const assignedMean = input.assignedMean ?? null
  const assignedSd = input.assignedSd ?? null
  const expectedQualitative = clean(input.expectedQualitative)
  const specChanged = Boolean(existing) && (
    nullableNumber((existing as RecordRow).assigned_mean) !== assignedMean
    || nullableNumber((existing as RecordRow).assigned_sd) !== assignedSd
    || clean(nullableString((existing as RecordRow).expected_qualitative)) !== expectedQualitative
  )
  const changeReason = clean(input.changeReason)
  if (specChanged && !changeReason) throw new HttpError(400, 'ระบุเหตุผลในการแก้ไข assigned spec')
  const payload = {
    assigned_mean: assignedMean,
    assigned_sd: assignedSd,
    expected_qualitative: expectedQualitative,
    updated_by: actor.id,
    change_reason: changeReason,
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error } = await admin.from('iqc_control_specs').update(payload).eq('id', asString((existing as RecordRow).id))
    fail(error)
  } else {
    const { error } = await admin.from('iqc_control_specs').insert({
      control_lot_id: input.controlLotId,
      analyte_id: input.analyteId,
      created_by: actor.id,
      ...payload,
    })
    fail(error)
  }
  // Keep the pre-baseline recalculation contract recognizable for older
  // callers while passing the actor through for per-result audit entries.
  // await recalculateChartStatuses(input.controlLotId, input.analyteId)
  if (specChanged) await recalculateChartStatuses(input.controlLotId, input.analyteId, actor)
  await writeAudit(actor, 'iqc.spec.upsert', 'iqc-control-spec', input.controlLotId, { ...input, recalculated: specChanged })
  return getIqcWorkspace(actor)
}

export async function createTeaSpec(input: {
  analyteIds: string[]
  teaValue: number
  teaMode: TeaMode
  teaUnit?: string | null
  sourceRef?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const analyteIds = [...new Set(input.analyteIds)]
  const admin = getAdminClient()
  const { error: deactivateError } = await admin
    .from('iqc_tea_specs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('analyte_id', analyteIds)
    .eq('is_active', true)
  fail(deactivateError)
  const { data, error } = await admin.from('iqc_tea_specs').insert(analyteIds.map((analyteId) => ({
    analyte_id: analyteId,
    tea_value: input.teaValue,
    tea_mode: input.teaMode,
    tea_unit: clean(input.teaUnit),
    source_ref: clean(input.sourceRef),
    created_by: actor.id,
  }))).select('id')
  fail(error)
  await writeAudit(actor, 'iqc.tea.create', 'iqc-tea-spec', asString((data as RecordRow[] | null)?.[0]?.id), { ...input, analyteIds })
  return getIqcWorkspace(actor)
}

// Pooled IQC relative SD (%) across all control lots for an analyte, computed on
// accepted, non-voided stat values. Returns the pooled RSD, total n, and lot count.
async function computePooledIqc(analyteId: string) {
  const { data, error } = await getAdminClient()
    .from('iqc_result_values')
    .select('control_lot_id,stat_value,status,is_voided')
    .eq('analyte_id', analyteId)
  fail(error)
  const byLot = new Map<string, number[]>()
  for (const row of (data ?? []) as RecordRow[]) {
    if (Boolean(row.is_voided) || asString(row.status) === 'rejected' || row.stat_value == null) continue
    const lot = asString(row.control_lot_id)
    byLot.set(lot, [...(byLot.get(lot) ?? []), Number(row.stat_value)])
  }
  const lotRsds: number[] = []
  let total = 0
  for (const values of byLot.values()) {
    total += values.length
    if (values.length >= 2) lotRsds.push(cv(values))
  }
  return { rsd: pooledRsd(lotRsds), n: total, lotCount: lotRsds.length }
}

export async function saveUncertaintyBudget(input: {
  analyteId: string
  measurand: string
  concentration: number
  coverageK?: number
  components?: { source: 'calibrator' | 'eqas' | 'other'; label?: string | null; value: number; distribution: Distribution; concentration: number }[]
}, actor: BmActor) {
  assertAdmin(actor)
  if (input.concentration <= 0) throw new HttpError(400, 'Concentration must be greater than zero')
  const admin = getAdminClient()
  const k = input.coverageK ?? 2

  const iqc = await computePooledIqc(input.analyteId)
  const iqcRsu = iqc.rsd / 100

  type ComponentInsert = Omit<IqcUncertaintyComponent, 'id'>
  const components: ComponentInsert[] = [
    { source: 'iqc', type: 'A', label: 'IQC pooled RSD', value: iqc.rsd, distribution: 'normal', divisor: 1, concentration: 100, su: iqc.rsd, rsu: iqcRsu },
  ]
  for (const c of input.components ?? []) {
    const divisor = divisorFor(c.distribution)
    const su = standardUncertainty(c.value, divisor)
    const rsu = relativeStandardUncertainty(su, c.concentration)
    components.push({ source: c.source, type: 'B', label: c.label ?? null, value: c.value, distribution: c.distribution, divisor, concentration: c.concentration, su, rsu })
  }

  const uc = combinedRelative(components.map((c) => c.rsu ?? 0))
  const ux = expandedRelative(uc, k)
  // QP §5.4.3.2a: >=120 in 6 months, or >=3 lots with >=100, (new test allowance >=30 elsewhere)
  const meets = iqc.n >= 120 || (iqc.lotCount >= 3 && iqc.n >= 100)

  // Replace any existing budget for the same analyte + measurand.
  const { data: existing, error: existingError } = await admin
    .from('iqc_uncertainty_budgets')
    .select('id')
    .eq('analyte_id', input.analyteId)
    .eq('measurand', input.measurand.trim())
  fail(existingError)
  for (const row of (existing ?? []) as RecordRow[]) {
    await admin.from('iqc_uncertainty_budgets').delete().eq('id', asString(row.id))
  }

  const { data: budget, error: budgetError } = await admin.from('iqc_uncertainty_budgets').insert({
    analyte_id: input.analyteId,
    measurand: input.measurand.trim(),
    concentration: input.concentration,
    coverage_k: k,
    combined_uc: uc,
    expanded_ux: ux,
    iqc_rsd: iqc.rsd,
    iqc_n: iqc.n,
    iqc_lot_count: iqc.lotCount,
    meets_requirement: meets,
    created_by: actor.id,
  }).select('id').single()
  fail(budgetError)
  const budgetId = asString((budget as RecordRow).id)

  const { error: compError } = await admin.from('iqc_uncertainty_components').insert(
    components.map((c) => ({
      budget_id: budgetId,
      source: c.source,
      type: c.type,
      label: c.label,
      value: c.value,
      distribution: c.distribution,
      divisor: c.divisor,
      concentration: c.concentration,
      su: c.su,
      rsu: c.rsu,
    })),
  )
  if (compError) {
    await admin.from('iqc_uncertainty_budgets').delete().eq('id', budgetId)
    throw new HttpError(400, compError.message || 'Could not save uncertainty components')
  }

  await writeAudit(actor, 'iqc.uncertainty.save', 'iqc-uncertainty-budget', budgetId, { measurand: input.measurand, uc, ux, iqcN: iqc.n })
  return getIqcWorkspace(actor)
}

// ---------- Run entry + evaluation ----------

export async function upsertControlPlan(input: {
  analyteId?: string
  analyteIds?: string[]
  instrumentId: string
  requiredLevels?: string[]
  frequency: 'daily' | 'per-run'
  westgardRules: WestgardRule[]
  policyProfile?: WestgardPolicyProfile
  isActive?: boolean
}, actor: BmActor) {
  assertAdmin(actor)
  await assertLinkedIqcInstrument(input.instrumentId)
  const analyteIds = [...new Set([...(input.analyteIds ?? []), input.analyteId ?? ''].filter(Boolean))]
  if (!analyteIds.length) throw new HttpError(400, 'เลือก Analyte หรือชุดทดสอบอย่างน้อย 1 รายการ')
  const requiredLevels = [...new Set((input.requiredLevels ?? []).map((level) => level.trim()).filter(Boolean))]
  const westgardRules = [...new Set(input.westgardRules)].filter((rule): rule is WestgardRule => (WESTGARD_RULES as readonly string[]).includes(rule))
  if (!westgardRules.length) throw new HttpError(400, 'เลือก Westgard rule อย่างน้อย 1 ข้อ')
  const admin = getAdminClient()
  const { data: analyteRows, error: analyteError } = await admin.from('iqc_analytes').select('id,code').in('id', analyteIds)
  fail(analyteError)
  const analyteRowsById = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const missingAnalytes = analyteIds.filter((analyteId) => !analyteRowsById.has(analyteId))
  if (missingAnalytes.length) throw new HttpError(400, 'ไม่พบ Analyte ที่เลือกสำหรับ Control plan')
  const policyByAnalyte = new Map(analyteIds.map((analyteId) => {
    const analyte = analyteRowsById.get(analyteId)
    const profile: WestgardPolicyProfile = /-VL\b/i.test(asString(analyte?.code)) ? 'vl-standard-v1' : 'cd4-legacy'
    return [analyteId, profile] as const
  }))
  const allSelectedVl = [...policyByAnalyte.values()].every((profile) => profile === 'vl-standard-v1')
  const policyProfile = input.policyProfile ?? (allSelectedVl ? 'vl-standard-v1' : 'cd4-legacy')
  const { data, error } = await admin.from('iqc_control_plans').upsert(analyteIds.map((analyteId) => ({
    analyte_id: analyteId,
    instrument_id: input.instrumentId,
    required_levels: requiredLevels.length ? requiredLevels : [NO_REQUIRED_LEVEL],
    frequency: input.frequency,
    westgard_rules: westgardRules,
    policy_profile: policyByAnalyte.get(analyteId) ?? 'cd4-legacy',
    is_active: input.isActive ?? true,
    created_by: actor.id,
    updated_at: new Date().toISOString(),
  })), { onConflict: 'analyte_id,instrument_id' }).select('id')
  fail(error)
  const { data: resultRows, error: resultError } = await admin.from('iqc_result_values').select('control_lot_id,analyte_id').in('analyte_id', analyteIds)
  fail(resultError)
  const affectedCharts = new Map<string, { controlLotId: string; analyteId: string }>()
  for (const row of resultRows ?? []) {
    const controlLotId = asString((row as RecordRow).control_lot_id)
    const analyteId = asString((row as RecordRow).analyte_id)
    affectedCharts.set(`${controlLotId}:${analyteId}`, { controlLotId, analyteId })
  }
  for (const { controlLotId, analyteId } of affectedCharts.values()) {
    await recalculateChartStatuses(controlLotId, analyteId, actor)
  }
  const id = asString((data as RecordRow[] | null)?.[0]?.id)
  await writeAudit(actor, 'iqc.controlPlan.upsert', 'iqc-control-plan', id, { ...input, analyteIds, requiredLevels, westgardRules, policyProfile, policyByAnalyte: Object.fromEntries(policyByAnalyte) })
  return getIqcWorkspace(actor)
}

export async function createRun(input: {
  instrumentId: string
  runNo?: number | null
  runDatetime?: string | null
  note?: string | null
  consumables?: { kind: ConsumableKind; lotNumber: string; stockLotId?: string | null; appliesScope?: ConsumableScope; beadCountPerTube?: number | null }[]
  values: { controlLotId: string; analyteId: string; numericValue?: number | null; qualitativeValue?: string | null }[]
}, actor: BmActor) {
  if (!input.values.length) throw new HttpError(400, 'At least one result value is required')
  const analyteIds = [...new Set(input.values.map((v) => v.analyteId))]
  const lotIds = [...new Set(input.values.map((v) => v.controlLotId))]
  if (!input.instrumentId) throw new HttpError(400, 'ต้องเลือกเครื่องมือก่อนบันทึก IQC run')
  const requestedInstrumentId = input.instrumentId
  const effectiveInstrumentId = await resolveCd4RunInstrumentId(analyteIds, requestedInstrumentId)
  await assertLinkedIqcInstrument(effectiveInstrumentId)
  const admin = getAdminClient()
  const consumableStockLots = await stockLotLabels((input.consumables ?? []).map((consumable) => consumable.stockLotId ?? ''))

  await assertUsableControlLots(lotIds)
  const [{ data: analyteRows, error: aErr }, { data: specRows, error: sErr }, { data: priorRows, error: pErr }, { data: planRows, error: planErr }, { data: baselineRows, error: baselineErr }, { data: lotRows, error: lotErr }, { data: materialRows, error: materialErr }] = await Promise.all([
    admin.from('iqc_analytes').select('*').in('id', analyteIds),
    admin.from('iqc_control_specs').select('*').in('control_lot_id', lotIds).in('analyte_id', analyteIds),
    admin
      .from('iqc_result_values')
      .select('control_lot_id,analyte_id,stat_value,status,is_voided,iqc_runs(run_datetime,instrument_id)')
      .in('control_lot_id', lotIds)
      .in('analyte_id', analyteIds),
    admin.from('iqc_control_plans').select('*').in('analyte_id', analyteIds).eq('is_active', true),
    admin.from('iqc_baselines').select('*').eq('state', 'approved').in('control_lot_id', lotIds).in('analyte_id', analyteIds).eq('instrument_id', effectiveInstrumentId),
    admin.from('iqc_control_lots').select('id,control_material_id').in('id', lotIds),
    admin.from('iqc_control_materials').select('id,level'),
  ])
  fail(aErr)
  fail(sErr)
  fail(pErr)
  fail(planErr)
  fail(baselineErr)
  fail(lotErr)
  fail(materialErr)
  const analyteById = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), mapAnalyte(row)]))
  const specByKey = new Map(((specRows ?? []) as RecordRow[]).map((row) => [`${asString(row.control_lot_id)}:${asString(row.analyte_id)}`, mapSpec(row)]))
   const baselineByKey = new Map(((baselineRows ?? []) as RecordRow[]).map((row) => [`${asString(row.control_lot_id)}:${asString(row.analyte_id)}:${effectiveInstrumentId}`, mapBaseline(row)]))
  const materialLevelById = new Map(((materialRows ?? []) as RecordRow[]).map((row) => [asString(row.id), nullableString(row.level)]))
  const lotLevelById = new Map(((lotRows ?? []) as RecordRow[]).map((row) => [asString(row.id), materialLevelById.get(asString(row.control_material_id)) ?? null]))
  const plans: IqcControlPlan[] = ((planRows ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id), analyteId: asString(row.analyte_id), analyteCode: '', analyteName: '', instrumentId: asString(row.instrument_id), instrumentName: '',
    requiredLevels: Array.isArray(row.required_levels) ? (row.required_levels as string[]).filter((level) => level !== NO_REQUIRED_LEVEL) : [], frequency: asString(row.frequency) === 'per-run' ? 'per-run' : 'daily',
    westgardRules: parseWestgardRules(row.westgard_rules), policyProfile: asString(row.policy_profile) === 'vl-standard-v1' ? 'vl-standard-v1' : 'cd4-legacy', isActive: Boolean(row.is_active),
  }))
  for (const plan of plans.filter((item) => item.frequency === 'per-run')) {
    if (!effectiveInstrumentId) throw new HttpError(400, `ต้องเลือก Instrument เพื่อใช้ control plan ของ ${analyteById.get(plan.analyteId)?.code ?? 'analyte'}`)
    if (plan.instrumentId !== effectiveInstrumentId) continue
    const enteredLevels = new Set(input.values.filter((value) => value.analyteId === plan.analyteId).map((value) => lotLevelById.get(value.controlLotId)).filter((level): level is string => Boolean(level)))
    const missing = plan.requiredLevels.filter((level) => !enteredLevels.has(level))
    if (missing.length) throw new HttpError(400, `Control plan ต้องบันทึก ${analyteById.get(plan.analyteId)?.code ?? 'analyte'} ระดับ ${missing.join(', ')} ในทุก run`)
  }

  const priorByKey = new Map<string, { stat: number; when: string }[]>()
  for (const row of (priorRows ?? []) as RecordRow[]) {
    if (Boolean(row.is_voided)) continue
    if (row.stat_value == null) continue
    const runRef = row.iqc_runs as RecordRow | null
    if (nullableString(runRef?.instrument_id) !== effectiveInstrumentId) continue
    const priorAnalyte = analyteById.get(asString(row.analyte_id))
    if (!isVlAnalyte(priorAnalyte) && asString(row.status) === 'rejected') continue
    const key = `${asString(row.control_lot_id)}:${asString(row.analyte_id)}`
    priorByKey.set(key, [...(priorByKey.get(key) ?? []), { stat: Number(row.stat_value), when: asString(runRef?.run_datetime) }])
  }

  // Insert the run
  const { data: runData, error: runError } = await admin.from('iqc_runs').insert({
    instrument_id: effectiveInstrumentId,
    run_no: input.runNo ?? null,
    run_datetime: input.runDatetime || new Date().toISOString(),
    note: clean(input.note),
    entered_by: actor.id,
  }).select('id,run_datetime').single()
  fail(runError)
  const runId = asString((runData as RecordRow).id)
  const runWhen = asString((runData as RecordRow).run_datetime)

  if (input.consumables?.length) {
    const { error: consError } = await admin.from('iqc_run_consumables').insert(
      input.consumables.map((c) => ({
        run_id: runId,
        kind: c.kind,
        lot_number: consumableStockLots.get(c.stockLotId ?? '')?.lotNumber ?? c.lotNumber.trim(),
        stock_lot_id: c.stockLotId || null,
        applies_scope: c.appliesScope ?? 'all',
        bead_count_per_tube: c.beadCountPerTube ?? null,
      })),
    )
    fail(consError)
  }

  let valueRows: RecordRow[]
  try {
    valueRows = input.values.map((value) => {
      const analyte = analyteById.get(value.analyteId)
      const key = `${value.controlLotId}:${value.analyteId}`
      const spec = specByKey.get(key)
      const plan = controlPlanFor(plans, value.analyteId, effectiveInstrumentId)
      const baseline = isQuantitativeVlAnalyte(analyte)
        ? baselineByKey.get(`${value.controlLotId}:${value.analyteId}:${effectiveInstrumentId}`)
        : null
      const profile = policyProfileFor(analyte, plan)
      if (analyte?.dataType === 'qualitative') {
        const expected = baseline?.expectedQualitative ?? spec?.expectedQualitative
        const actual = clean(value.qualitativeValue)
        const status: QcStatus = !actual
          ? 'not_evaluated'
          : isBelowLodNormal(analyte)
          ? (isBelowLodResult(actual, belowLodLimit(analyte)) ? 'accepted' : 'rejected')
          : isVlAnalyte(analyte) && baseline?.state !== 'approved'
          ? 'not_evaluated'
          : baseline?.state === 'approved'
          ? (expected && actual ? (expected.trim().toLowerCase() === actual.toLowerCase() ? 'accepted' : 'rejected') : 'not_evaluated')
          : expected && actual && expected.trim().toLowerCase() !== actual.toLowerCase() ? 'rejected' : 'accepted'
        return {
          run_id: runId,
          control_lot_id: value.controlLotId,
          analyte_id: value.analyteId,
          numeric_value: null,
          stat_value: null,
          qualitative_value: clean(value.qualitativeValue),
          z_score: null,
          violated_rules: [],
          status,
          evaluation_baseline_id: baseline?.id ?? null,
          evaluation_policy_profile: isVlAnalyte(analyte) ? profile : null,
          evaluated_at: baseline || isBelowLodNormal(analyte) ? new Date().toISOString() : null,
        }
      }
      const numeric = value.numericValue ?? null
      const scale = analyte?.scale ?? 'linear'
      if (numeric == null) throw new HttpError(400, `Numeric value required for ${analyte?.code ?? 'analyte'}`)
      if (scale === 'log10' && numeric <= 0) throw new HttpError(400, `${analyte?.code} value must be > 0 for log scale`)
      const statValue = toStat(numeric, scale)
      const { meanValue, sdValue } = baseline?.state === 'approved'
        ? { meanValue: baseline.mean, sdValue: baseline.sd }
        : activeStats(spec)
      let z: number | null = null
      let violated: string[] = []
      let status: QcStatus = isVlAnalyte(analyte) && !baseline ? 'not_evaluated' : 'accepted'
      if ((!isVlAnalyte(analyte) || baseline?.state === 'approved') && meanValue != null && sdValue != null && sdValue > 0) {
        const series = [...(priorByKey.get(key) ?? [])]
          .sort((a, b) => a.when.localeCompare(b.when))
          .map((p) => p.stat)
        series.push(statValue)
        const point = evaluateLatestByPolicy(series, meanValue, sdValue, plan?.westgardRules, profile)
        z = point.z
        violated = point.violatedRules
        status = point.status
      }
      return {
        run_id: runId,
        control_lot_id: value.controlLotId,
        analyte_id: value.analyteId,
        numeric_value: numeric,
        stat_value: statValue,
        qualitative_value: null,
        z_score: z,
        violated_rules: violated,
        status,
        evaluation_baseline_id: baseline?.id ?? null,
        evaluation_policy_profile: isVlAnalyte(analyte) ? profile : null,
        evaluated_at: baseline ? new Date().toISOString() : null,
      }
    })
  } catch (error) {
    await admin.from('iqc_runs').delete().eq('id', runId)
    throw error
  }

  const { error: valueError } = await admin.from('iqc_result_values').insert(valueRows)
  if (valueError) {
    await admin.from('iqc_runs').delete().eq('id', runId)
    throw new HttpError(400, valueError.message || 'Could not save run results')
  }
  const changedKeys = [...new Set(valueRows.map((v) => `${asString(v.control_lot_id)}:${asString(v.analyte_id)}`))]
  for (const key of changedKeys) {
    const [controlLotId, analyteId] = key.split(':')
    await recalculateChartStatuses(controlLotId, analyteId, actor)
  }

  await writeAudit(actor, 'iqc.run.create', 'iqc-run', runId, {
    runDatetime: runWhen,
    requestedInstrumentId,
    instrumentId: effectiveInstrumentId,
    values: valueRows.map((v) => ({ analyteId: asString(v.analyte_id), status: v.status, rules: v.violated_rules })),
  })
  return getIqcWorkspace(actor)
}

// Bulk import: one run per row (chronological), evaluating Westgard as the series
// grows — used by the UI paste-import and matches single-run entry semantics.
export async function importIqcRuns(input: {
  controlLotId: string
  instrumentId?: string | null
  analyteIds: string[]
  trucountLot?: string | null
  rows: { runDatetime: string; values: (number | null)[] }[]
}, actor: BmActor) {
  if (!input.analyteIds.length) throw new HttpError(400, 'Select at least one analyte column')
  if (!input.rows.length) throw new HttpError(400, 'No rows to import')
  await assertUsableControlLots([input.controlLotId])
  const admin = getAdminClient()
  let instrumentId = input.instrumentId ?? null
  if (!instrumentId) {
    const { data: planInstruments, error: planInstrumentError } = await admin.from('iqc_control_plans').select('instrument_id').in('analyte_id', input.analyteIds).eq('is_active', true)
    fail(planInstrumentError)
    const ids = [...new Set(((planInstruments ?? []) as RecordRow[]).map((row) => asString(row.instrument_id)).filter(Boolean))]
    if (ids.length === 1) instrumentId = ids[0]
  }
  if (!instrumentId) throw new HttpError(400, 'ต้องเลือกเครื่องมือสำหรับการนำเข้า เพื่อผูกผลกับ QC baseline')
  const requestedInstrumentId = instrumentId
  instrumentId = await resolveCd4RunInstrumentId(input.analyteIds, instrumentId)
  await assertLinkedIqcInstrument(instrumentId)

  const [{ data: analyteRows, error: aErr }, { data: specRows, error: sErr }, { data: priorRows, error: pErr }, { data: planRows, error: planErr }, { data: baselineRows, error: baselineErr }] = await Promise.all([
    admin.from('iqc_analytes').select('*').in('id', input.analyteIds),
    admin.from('iqc_control_specs').select('*').eq('control_lot_id', input.controlLotId).in('analyte_id', input.analyteIds),
    admin
      .from('iqc_result_values')
      .select('analyte_id,stat_value,status,is_voided,iqc_runs(run_datetime,instrument_id)')
      .eq('control_lot_id', input.controlLotId)
      .in('analyte_id', input.analyteIds),
    admin.from('iqc_control_plans').select('*').in('analyte_id', input.analyteIds).eq('instrument_id', instrumentId).eq('is_active', true),
    admin.from('iqc_baselines').select('*').eq('control_lot_id', input.controlLotId).eq('instrument_id', instrumentId).eq('state', 'approved').in('analyte_id', input.analyteIds),
  ])
  fail(aErr)
  fail(sErr)
  fail(pErr)
  fail(planErr)
  fail(baselineErr)
  const analyteById = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), mapAnalyte(row)]))
  const specByAnalyte = new Map(((specRows ?? []) as RecordRow[]).map((row) => [asString(row.analyte_id), mapSpec(row)]))
  const planByAnalyte = new Map(((planRows ?? []) as RecordRow[]).map((row) => [asString(row.analyte_id), row]))
  const baselineByAnalyte = new Map(((baselineRows ?? []) as RecordRow[]).map((row) => [asString(row.analyte_id), mapBaseline(row)]))

  const seriesByAnalyte = new Map<string, number[]>()
  const priorSorted = ((priorRows ?? []) as RecordRow[])
    .filter((row) => !Boolean(row.is_voided) && row.stat_value != null && nullableString((row.iqc_runs as RecordRow | null)?.instrument_id) === instrumentId && (isVlAnalyte(analyteById.get(asString(row.analyte_id))) || asString(row.status) !== 'rejected'))
    .map((row) => ({ analyteId: asString(row.analyte_id), stat: Number(row.stat_value), when: asString((row.iqc_runs as RecordRow | null)?.run_datetime) }))
    .sort((a, b) => a.when.localeCompare(b.when))
  for (const p of priorSorted) seriesByAnalyte.set(p.analyteId, [...(seriesByAnalyte.get(p.analyteId) ?? []), p.stat])

  const sortedRows = [...input.rows].sort((a, b) => a.runDatetime.localeCompare(b.runDatetime))
  let imported = 0
  for (const row of sortedRows) {
    const { data: runData, error: runError } = await admin
      .from('iqc_runs')
      .insert({ instrument_id: instrumentId, run_datetime: row.runDatetime, entered_by: actor.id })
      .select('id')
      .single()
    fail(runError)
    const runId = asString((runData as RecordRow).id)

    if (input.trucountLot?.trim()) {
      const { error: consumableError } = await admin.from('iqc_run_consumables').insert({ run_id: runId, kind: 'trucount-tube', lot_number: input.trucountLot.trim(), applies_scope: 'absolute-only' })
      if (consumableError) {
        await admin.from('iqc_runs').delete().eq('id', runId)
        throw new HttpError(400, consumableError.message || 'Could not save IQC run consumable')
      }
    }

    const valueRows: RecordRow[] = []
    row.values.forEach((value, index) => {
      if (value == null) return
      const analyteId = input.analyteIds[index]
      const analyte = analyteById.get(analyteId)
      const scale = analyte?.scale ?? 'linear'
      if (scale === 'log10' && value <= 0) return
      const statValue = toStat(value, scale)
      const plan = planByAnalyte.get(analyteId)
      const baseline = baselineByAnalyte.get(analyteId)
      const profile = policyProfileFor(analyte, plan ? { policyProfile: asString(plan.policy_profile) as WestgardPolicyProfile } : null)
      const { meanValue, sdValue } = baseline?.state === 'approved'
        ? { meanValue: baseline.mean, sdValue: baseline.sd }
        : activeStats(specByAnalyte.get(analyteId))
      let z: number | null = null
      let violated: string[] = []
      let status: QcStatus = isVlAnalyte(analyte) && !baseline ? 'not_evaluated' : 'accepted'
      if ((!isVlAnalyte(analyte) || baseline?.state === 'approved') && meanValue != null && sdValue != null && sdValue > 0) {
        const series = [...(seriesByAnalyte.get(analyteId) ?? []), statValue]
        const point = evaluateLatestByPolicy(series, meanValue, sdValue, parseWestgardRules(plan?.westgard_rules), profile)
        z = point.z
        violated = point.violatedRules
        status = point.status
        if (status !== 'rejected') seriesByAnalyte.set(analyteId, series)
      } else if (!isVlAnalyte(analyte) || baseline?.state === 'approved') {
        seriesByAnalyte.set(analyteId, [...(seriesByAnalyte.get(analyteId) ?? []), statValue])
      }
      valueRows.push({
        run_id: runId,
        control_lot_id: input.controlLotId,
        analyte_id: analyteId,
        numeric_value: value,
        stat_value: statValue,
        z_score: z,
        violated_rules: violated,
        status,
        evaluation_baseline_id: baseline?.id ?? null,
        evaluation_policy_profile: isVlAnalyte(analyte) ? profile : null,
        evaluated_at: baseline ? new Date().toISOString() : null,
      })
    })

    if (!valueRows.length) {
      await admin.from('iqc_runs').delete().eq('id', runId)
      continue
    }
    const { error: valueError } = await admin.from('iqc_result_values').insert(valueRows)
    if (valueError) {
      await admin.from('iqc_runs').delete().eq('id', runId)
      throw new HttpError(400, valueError.message || 'Could not import run')
    }
    imported += 1
  }

  await writeAudit(actor, 'iqc.import', 'iqc-control-lot', input.controlLotId, { imported, analyteIds: input.analyteIds, requestedInstrumentId, instrumentId })
  for (const analyteId of input.analyteIds) {
    await recalculateChartStatuses(input.controlLotId, analyteId, actor)
  }
  return getIqcWorkspace(actor)
}

export async function voidResult(resultId: string, reason: string, actor: BmActor) {
  assertAdmin(actor)
  if (!reason.trim()) throw new HttpError(400, 'Void reason is required')
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_result_values')
    .select('control_lot_id,analyte_id,run_id,status,is_voided')
    .eq('id', resultId)
    .maybeSingle()
  fail(existingError)
  if (!existing) throw new HttpError(404, 'IQC result not found')
  if (Boolean((existing as RecordRow).is_voided)) throw new HttpError(400, 'IQC result is already voided')
  if (asString((existing as RecordRow).status) === 'rejected') {
    const { count, error: caError } = await admin.from('iqc_corrective_actions').select('id', { count: 'exact', head: true }).eq('run_id', asString((existing as RecordRow).run_id))
    fail(caError)
    if (!count) throw new HttpError(409, 'ผล rejected ต้องเปิด Corrective action ก่อน void/ปิดงาน')
  }
  const { error } = await admin
    .from('iqc_result_values')
    .update({ is_voided: true, void_reason: reason.trim() })
    .eq('id', resultId)
  fail(error)
  await recalculateChartStatuses(asString((existing as RecordRow).control_lot_id), asString((existing as RecordRow).analyte_id), actor)
  await writeAudit(actor, 'iqc.result.void', 'iqc-result', resultId, { reason: reason.trim() })
  return getIqcWorkspace(actor)
}

async function getUsableLabValues(controlLotId: string, analyteId: string) {
  const admin = getAdminClient()
  const { data: valueRows, error } = await admin
    .from('iqc_result_values')
    .select('stat_value,is_voided,status')
    .eq('control_lot_id', controlLotId)
    .eq('analyte_id', analyteId)
  fail(error)
  const usable = ((valueRows ?? []) as RecordRow[])
    .filter((row) => !Boolean(row.is_voided) && asString(row.status) !== 'rejected' && row.stat_value != null)
    .map((row) => Number(row.stat_value))
  return usable
}

function parseWestgardRules(value: unknown): WestgardRule[] {
  const rules = (Array.isArray(value) ? value : []).filter((rule): rule is WestgardRule =>
    typeof rule === 'string' && (WESTGARD_RULES as readonly string[]).includes(rule),
  )
  return rules.length ? rules : [...WESTGARD_RULES]
}

function controlPlanFor(plans: IqcControlPlan[], analyteId: string, instrumentId: string | null | undefined) {
  return plans.find((plan) => plan.analyteId === analyteId && plan.instrumentId === instrumentId && plan.isActive) ?? null
}

async function assertAllLotAnalytesLockable(controlLotId: string) {
  const admin = getAdminClient()
  const [{ data: resultRows, error: resultError }, { data: specRows, error: specError }] = await Promise.all([
    admin.from('iqc_result_values').select('analyte_id').eq('control_lot_id', controlLotId),
    admin.from('iqc_control_specs').select('analyte_id').eq('control_lot_id', controlLotId),
  ])
  fail(resultError)
  fail(specError)
  const analyteIds = [...new Set([
    ...((resultRows ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)),
    ...((specRows ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)),
  ].filter(Boolean))]
  if (!analyteIds.length) throw new HttpError(400, 'ยังไม่มี analyte สำหรับ Control lot นี้')
  const counts = await Promise.all(analyteIds.map(async (analyteId) => ({ analyteId, n: (await getUsableLabValues(controlLotId, analyteId)).length })))
  const incomplete = counts.filter((row) => row.n < 2)
  if (incomplete.length) throw new HttpError(400, `ไม่สามารถ Lock & ปิด Lot ได้: ${incomplete.map((row) => `${row.analyteId} มี ${row.n} จุด`).join(', ')}`)
  return counts
}

async function assertLegacyLockAllowed(controlLotId: string, analyteId: string) {
  const { data, error } = await getAdminClient().from('iqc_analytes').select('code').eq('id', analyteId).maybeSingle()
  fail(error)
  if (isVlAnalyte(data ? { code: asString((data as RecordRow).code) } : undefined)) {
    throw new HttpError(409, 'VL ใช้ QC baseline เป็นเกณฑ์ตัดสินแล้ว — ทบทวนและอนุมัติ baseline แทนการ Lock Lab Mean/SD')
  }
  void controlLotId
}

async function assertLegacyLotLockAllowed(controlLotId: string) {
  const admin = getAdminClient()
  const [{ data: resultRows, error: resultError }, { data: specRows, error: specError }] = await Promise.all([
    admin.from('iqc_result_values').select('analyte_id').eq('control_lot_id', controlLotId),
    admin.from('iqc_control_specs').select('analyte_id').eq('control_lot_id', controlLotId),
  ])
  fail(resultError)
  fail(specError)
  const analyteIds = [...new Set([
    ...((resultRows ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)),
    ...((specRows ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)),
  ].filter(Boolean))]
  if (!analyteIds.length) return
  const { data: analyteRows, error: analyteError } = await admin.from('iqc_analytes').select('id,code').in('id', analyteIds)
  fail(analyteError)
  if (((analyteRows ?? []) as RecordRow[]).some((row) => isVlAnalyte({ code: asString(row.code) }))) {
    throw new HttpError(409, 'Control lot นี้มี VL — ใช้ QC baseline แทนการ Lock & ปิด Lot แบบเดิม')
  }
}

type PreparedLabLock = {
  analyteId: string
  labMean: number
  labSd: number
  labN: number
  overridden: boolean
}

async function prepareLabLock(controlLotId: string, analyteId: string, overrideReason?: string | null): Promise<PreparedLabLock> {
  const usable = await getUsableLabValues(controlLotId, analyteId)
  if (usable.length < 2) {
    throw new HttpError(400, `ต้องมีอย่างน้อย 2 จุดจึงคำนวณ SD ได้ (ตอนนี้ ${usable.length})`)
  }
  const overridden = usable.length < LAB_LOCK_MIN_POINTS
  if (overridden && !overrideReason?.trim()) {
    throw new HttpError(400, `ต้องมีอย่างน้อย ${LAB_LOCK_MIN_POINTS} จุดก่อน lock (ตอนนี้ ${usable.length}) — หรือระบุเหตุผล override`)
  }
  return {
    analyteId,
    labMean: mean(usable),
    labSd: sd(usable),
    labN: usable.length,
    overridden,
  }
}

async function saveLabLock(controlLotId: string, analyteId: string, actor: BmActor, overrideReason?: string | null) {
  const admin = getAdminClient()
  const lock = await prepareLabLock(controlLotId, analyteId, overrideReason)

  const { data: existing, error: existingError } = await admin
    .from('iqc_control_specs')
    .select('id')
    .eq('control_lot_id', controlLotId)
    .eq('analyte_id', analyteId)
    .maybeSingle()
  fail(existingError)
  const payload = {
    lab_mean: lock.labMean,
    lab_sd: lock.labSd,
    lab_n: lock.labN,
    lab_locked_at: new Date().toISOString(),
    active_limit: 'lab',
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error: updErr } = await admin.from('iqc_control_specs').update(payload).eq('id', asString((existing as RecordRow).id))
    fail(updErr)
  } else {
    const { error: insErr } = await admin.from('iqc_control_specs').insert({ control_lot_id: controlLotId, analyte_id: analyteId, created_by: actor.id, ...payload })
    fail(insErr)
  }
  await writeAudit(actor, 'iqc.spec.lockLab', 'iqc-control-spec', controlLotId, {
    analyteId,
    labMean: lock.labMean,
    labSd: lock.labSd,
    labN: lock.labN,
    overridden: lock.overridden,
    overrideReason: lock.overridden ? overrideReason?.trim() : null,
  })
  return lock
}

type VlEvaluationPayload = {
  resultId: string
  analyteId: string
  baselineId: string | null
  status: QcStatus
  z: number | null
  violatedRules: WestgardRule[]
  oldStatus: QcStatus
  oldZ: number | null
}

type VlBaselineOverride = {
  analyteId: string
  instrumentId: string
  mean: number | null
  sd: number | null
  expectedQualitative: string | null
  includedResultIds: Set<string>
}

async function buildVlEvaluationPayload(controlLotId: string, override?: VlBaselineOverride): Promise<VlEvaluationPayload[]> {
  const admin = getAdminClient()
  const [{ data: analyteRows, error: analyteError }, { data: baselineRows, error: baselineError }, { data: valueRows, error: valueError }, { data: planRows, error: planError }] = await Promise.all([
    admin.from('iqc_analytes').select('*').ilike('code', '%-VL%'),
    admin.from('iqc_baselines').select('*').eq('control_lot_id', controlLotId).eq('state', 'approved'),
    admin.from('iqc_result_values').select('id,run_id,analyte_id,numeric_value,stat_value,qualitative_value,z_score,status,is_voided,iqc_runs(run_datetime,instrument_id)').eq('control_lot_id', controlLotId),
    admin.from('iqc_control_plans').select('analyte_id,instrument_id,westgard_rules,policy_profile').eq('is_active', true),
  ])
  fail(analyteError)
  fail(baselineError)
  fail(valueError)
  fail(planError)

  // An explicitly excluded historical result must remain excluded when the
  // whole lot is recalculated for between-level R-4s. Future results are not
  // in this table yet and remain included by default.
  const approvedBaselineIds = ((baselineRows ?? []) as RecordRow[]).map((row) => asString(row.id)).filter(Boolean)
  const { data: candidateRows, error: candidateError } = approvedBaselineIds.length
    ? await admin.from('iqc_baseline_candidates').select('baseline_id,result_id,included').in('baseline_id', approvedBaselineIds)
    : { data: [], error: null }
  fail(candidateError)
  const excludedResultIds = new Set(
    ((candidateRows ?? []) as RecordRow[])
      .filter((row) => !Boolean(row.included))
      .map((row) => asString(row.result_id))
      .filter(Boolean),
  )

  const analytes = ((analyteRows ?? []) as RecordRow[]).map(mapAnalyte).filter((analyte) => isVlAnalyte(analyte))
  const analyteMap = new Map(analytes.map((analyte) => [analyte.id, analyte]))
  const plans = (planRows ?? []) as RecordRow[]
  const values = ((valueRows ?? []) as RecordRow[])
    .filter((row) => isVlAnalyte(analyteMap.get(asString(row.analyte_id))) && !Boolean(row.is_voided))
    .map((row) => {
      const analyte = analyteMap.get(asString(row.analyte_id))
      const run = row.iqc_runs as RecordRow | null
      return {
        row,
        instrumentId: nullableString(run?.instrument_id),
        value: {
          resultId: asString(row.id),
          runId: asString(row.run_id),
          runDatetime: asString(run?.run_datetime),
          analyteId: asString(row.analyte_id),
          panel: analyte?.groupLabel ?? null,
          numericValue: nullableNumber(row.numeric_value),
          statValue: nullableNumber(row.stat_value),
          qualitativeValue: nullableString(row.qualitative_value),
          currentStatus: asString(row.status) as QcStatus,
          currentZ: nullableNumber(row.z_score),
          isVoided: false,
        } satisfies BaselineValue,
      }
    })
  const valuesByInstrument = new Map<string, typeof values>()
  for (const item of values) {
    const instrumentKey = item.instrumentId ?? 'unassigned'
    valuesByInstrument.set(instrumentKey, [...(valuesByInstrument.get(instrumentKey) ?? []), item])
  }
  const baselineRowsByScope = ((baselineRows ?? []) as RecordRow[]).map(mapBaseline)
  const baselineByScope = new Map(baselineRowsByScope.map((baseline) => [`${baseline.instrumentId}:${baseline.analyteId}`, baseline]))
  if (override) {
    // The selected review is authoritative for this scope. This also lets an
    // Admin re-include a result that was excluded by the previous baseline.
    for (const row of override.includedResultIds) excludedResultIds.delete(row)
    for (const item of values) {
      if (item.instrumentId !== override.instrumentId || item.value.analyteId !== override.analyteId) continue
      if (!override.includedResultIds.has(item.value.resultId)) excludedResultIds.add(item.value.resultId)
    }
  }
  const evaluations: VlEvaluationPayload[] = []
  for (const [instrumentKey, items] of valuesByInstrument) {
    const instrumentId = instrumentKey === 'unassigned' ? null : instrumentKey
    const baselines = new Map<string, EvaluationBaseline>()
    for (const analyte of analytes) {
      const isOverride = isQuantitativeVlAnalyte(analyte) && instrumentId === override?.instrumentId && analyte.id === override.analyteId
      const baseline = isOverride
        ? { id: null, mean: override?.mean ?? null, sd: override?.sd ?? null, expectedQualitative: override?.expectedQualitative ?? null }
        : isQuantitativeVlAnalyte(analyte) && instrumentId ? baselineByScope.get(`${instrumentId}:${analyte.id}`) ?? null : null
      const plan = plans.find((item) => asString(item.analyte_id) === analyte.id && asString(item.instrument_id) === instrumentId)
      if (baseline) {
        baselines.set(analyte.id, {
          id: baseline.id,
          analyteId: analyte.id,
          mean: baseline.mean,
          sd: baseline.sd,
          expectedQualitative: baseline.expectedQualitative,
          policyProfile: policyProfileFor(analyte, { policyProfile: asString(plan?.policy_profile) as WestgardPolicyProfile }),
          rules: parseWestgardRules(plan?.westgard_rules),
        })
      }
    }
    // VL Normal is qualitative and has no baseline candidate/exclusion list.
    // Keep it in the lot recalculation payload so the database transaction can
    // preserve its direct Not detected/LOD evaluation.
    const includedResultIds = new Set(items
      .filter((item) => isBelowLodNormal(analyteMap.get(item.value.analyteId)) || !excludedResultIds.has(item.value.resultId))
      .map((item) => item.value.resultId))
    const evaluated = evaluateVlScope({
      values: items.map((item) => item.value),
      analytes: new Map(analytes.map((analyte) => [analyte.id, { id: analyte.id, code: analyte.code, dataType: analyte.dataType, panel: analyte.groupLabel }])),
      baselines,
      includedResultIds,
    })
    for (const item of items) {
      const analyte = analyteMap.get(item.value.analyteId)
      const evaluation = evaluated.get(item.value.resultId)
      const baseline = baselines.get(item.value.analyteId)
      const normalStatus = evaluateVlNormalResult(analyte, item.value.qualitativeValue)
      const status = baseline && evaluation ? evaluation.status : normalStatus ?? 'not_evaluated'
      evaluations.push({
        resultId: item.value.resultId,
        analyteId: item.value.analyteId,
        baselineId: baseline ? evaluation?.baselineId ?? baseline.id : null,
        status,
        z: baseline && evaluation ? evaluation.z : null,
        violatedRules: baseline && evaluation ? evaluation.violatedRules : [],
        oldStatus: item.value.currentStatus,
        oldZ: item.value.currentZ,
      })
    }
  }
  return evaluations
}

async function recalculateVlStatuses(controlLotId: string, actor?: BmActor) {
  const admin = getAdminClient()
  const evaluations = await buildVlEvaluationPayload(controlLotId)
  for (const evaluation of evaluations) {
    const evaluatedAt = new Date().toISOString()
    const patch: Record<string, unknown> = {
      status: evaluation.status,
      z_score: evaluation.z,
      violated_rules: evaluation.violatedRules,
      evaluation_baseline_id: evaluation.baselineId,
      evaluation_policy_profile: 'vl-standard-v1',
      evaluated_at: evaluatedAt,
    }
    const { error } = await admin.from('iqc_result_values').update(patch).eq('id', evaluation.resultId)
    fail(error)
    if (actor) {
      await writeAudit(actor, 'iqc.result.recalculate', 'iqc-result', evaluation.resultId, {
        baselineId: evaluation.baselineId,
        old: { status: evaluation.oldStatus, zScore: evaluation.oldZ },
        new: { status: evaluation.status, zScore: evaluation.z, violatedRules: evaluation.violatedRules },
      })
    }
  }
}

async function recalculateChartStatuses(controlLotId: string, analyteId: string, actor?: BmActor) {
  const analyteCheck = await getAdminClient().from('iqc_analytes').select('code').eq('id', analyteId).maybeSingle()
  fail(analyteCheck.error)
  if (isVlAnalyte(analyteCheck.data ? { code: asString((analyteCheck.data as RecordRow).code) } : undefined)) {
    await recalculateVlStatuses(controlLotId, actor)
    return
  }
  const admin = getAdminClient()
  const [{ data: analyteRow, error: analyteError }, { data: specRows, error: specError }, { data: valueRows, error: valueError }, { data: planRows, error: planError }] = await Promise.all([
    admin.from('iqc_analytes').select('*').eq('id', analyteId).maybeSingle(),
    admin.from('iqc_control_specs').select('*').eq('control_lot_id', controlLotId).eq('analyte_id', analyteId),
    admin
      .from('iqc_result_values')
      .select('id,stat_value,numeric_value,qualitative_value,is_voided,iqc_runs(run_datetime,instrument_id)')
      .eq('control_lot_id', controlLotId)
      .eq('analyte_id', analyteId),
    admin.from('iqc_control_plans').select('instrument_id,westgard_rules').eq('analyte_id', analyteId).eq('is_active', true),
  ])
  fail(analyteError)
  fail(specError)
  fail(valueError)
  fail(planError)
  if (!analyteRow) return

  const analyte = mapAnalyte(analyteRow as RecordRow)
  const spec = ((specRows ?? []) as RecordRow[]).map(mapSpec)[0]
  const { meanValue, sdValue } = activeStats(spec)
  const rulesByInstrument = new Map(((planRows ?? []) as RecordRow[]).map((row) => [asString(row.instrument_id), parseWestgardRules(row.westgard_rules)]))
  const ordered = ((valueRows ?? []) as RecordRow[])
    .map((row) => ({
      row,
      id: asString(row.id),
      when: asString((row.iqc_runs as RecordRow | null)?.run_datetime),
    }))
    .sort((a, b) => a.when.localeCompare(b.when) || a.id.localeCompare(b.id))

  const acceptedSeries: number[] = []
  for (const item of ordered) {
    const row = item.row
    if (Boolean(row.is_voided)) continue
    let z: number | null = null
    let violated: string[] = []
    let status: QcStatus = 'accepted'

    if (analyte.dataType === 'qualitative') {
      const expected = spec?.expectedQualitative
      const actual = clean(nullableString(row.qualitative_value))
      status = expected && actual && expected.trim().toLowerCase() !== actual.trim().toLowerCase() ? 'rejected' : 'accepted'
    } else if (row.stat_value != null && meanValue != null && sdValue != null && sdValue > 0) {
      const stat = Number(row.stat_value)
      const runRef = row.iqc_runs as RecordRow | null
      const point = evaluateLatest([...acceptedSeries, stat], meanValue, sdValue, rulesByInstrument.get(nullableString(runRef?.instrument_id) ?? ''))
      z = point.z
      violated = point.violatedRules
      status = point.status
      if (status !== 'rejected') {
        acceptedSeries.push(stat)
      } else {
        // A rejected run is not part of a valid consecutive trend. Keeping the
        // prior accepted series would let 4-1s/10x span across a failed run.
        acceptedSeries.length = 0
      }
    } else if (row.stat_value != null) {
      acceptedSeries.push(Number(row.stat_value))
    }

    const { error } = await admin
      .from('iqc_result_values')
      .update({ z_score: z, violated_rules: violated, status })
      .eq('id', item.id)
    fail(error)
  }
}

export async function lockLabStatistics(controlLotId: string, analyteId: string, actor: BmActor, overrideReason?: string | null) {
  assertAdmin(actor)
  await assertLegacyLockAllowed(controlLotId, analyteId)
  await saveLabLock(controlLotId, analyteId, actor, overrideReason)
  return getIqcWorkspace(actor)
}

export async function unlockLabStatistics(controlLotId: string, analyteId: string, reason: string, actor: BmActor) {
  assertAdmin(actor)
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new HttpError(400, 'Unlock reason is required')
  const { error } = await getAdminClient()
    .from('iqc_control_specs')
    .update({ lab_locked_at: null, updated_at: new Date().toISOString() })
    .eq('control_lot_id', controlLotId)
    .eq('analyte_id', analyteId)
  fail(error)
  await writeAudit(actor, 'iqc.spec.unlockLab', 'iqc-control-spec', controlLotId, { analyteId, reason: trimmedReason })
  return getIqcWorkspace(actor)
}

export async function lockControlLotStatistics(controlLotId: string, actor: BmActor, overrideReason?: string | null) {
  assertAdmin(actor)
  await assertLegacyLotLockAllowed(controlLotId)
  const admin = getAdminClient()
  const counts = await assertAllLotAnalytesLockable(controlLotId)
  const needsOverride = counts.some((row) => row.n < LAB_LOCK_MIN_POINTS)
  if (needsOverride && !overrideReason?.trim()) {
    throw new HttpError(400, `มีบาง analyte ยังไม่ครบ ${LAB_LOCK_MIN_POINTS} จุด — ระบุเหตุผล override เพื่อ lock ทั้ง lot`)
  }

  // A lot must never be left partly locked. Prepare every analyte first, then
  // persist all statistics through one upsert statement before closing the lot.
  const locked = await Promise.all(
    counts.map((row) => prepareLabLock(controlLotId, row.analyteId, row.n < LAB_LOCK_MIN_POINTS ? overrideReason : null)),
  )
  const lockedAt = new Date().toISOString()
  const { data: existingSpecs, error: existingSpecsError } = await admin
    .from('iqc_control_specs')
    .select('analyte_id,created_by')
    .eq('control_lot_id', controlLotId)
  fail(existingSpecsError)
  const createdByByAnalyte = new Map(
    ((existingSpecs ?? []) as RecordRow[]).map((spec) => [asString(spec.analyte_id), nullableString(spec.created_by)]),
  )
  const { error: lockError } = await admin
    .from('iqc_control_specs')
    .upsert(
      locked.map((lock) => ({
        control_lot_id: controlLotId,
        analyte_id: lock.analyteId,
        created_by: createdByByAnalyte.get(lock.analyteId) ?? actor.id,
        lab_mean: lock.labMean,
        lab_sd: lock.labSd,
        lab_n: lock.labN,
        lab_locked_at: lockedAt,
        active_limit: 'lab',
        updated_at: lockedAt,
      })),
      { onConflict: 'control_lot_id,analyte_id' },
    )
  fail(lockError)
  const { error: closeError } = await admin.from('iqc_control_lots').update({ is_active: false }).eq('id', controlLotId)
  fail(closeError)
  await writeAudit(actor, 'iqc.lot.lockAndClose', 'iqc-control-lot', controlLotId, {
    locked: locked.map((row) => ({
      analyteId: row.analyteId,
      labMean: row.labMean,
      labSd: row.labSd,
      labN: row.labN,
      overridden: row.overridden,
    })),
    overrideReason: needsOverride ? overrideReason?.trim() : null,
    isActive: false,
  })
  return getIqcWorkspace(actor)
}

export async function unlockControlLotStatistics(controlLotId: string, reason: string, actor: BmActor) {
  assertAdmin(actor)
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new HttpError(400, 'Unlock reason is required')
  const admin = getAdminClient()
  const { data, error: selectError } = await admin
    .from('iqc_control_specs')
    .select('analyte_id')
    .eq('control_lot_id', controlLotId)
    .not('lab_locked_at', 'is', null)
  fail(selectError)
  const analyteIds = ((data ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)).filter(Boolean)
  if (!analyteIds.length) throw new HttpError(400, 'ไม่มี analyte ที่ถูก lock ใน lot นี้')
  const { error } = await admin
    .from('iqc_control_specs')
    .update({ lab_locked_at: null, updated_at: new Date().toISOString() })
    .eq('control_lot_id', controlLotId)
    .not('lab_locked_at', 'is', null)
  fail(error)
  await writeAudit(actor, 'iqc.spec.unlockLot', 'iqc-control-lot', controlLotId, { reason: trimmedReason, analyteIds })
  return getIqcWorkspace(actor)
}

export async function createCorrectiveAction(input: {
  runId: string
  resultId?: string | null
  analyteId?: string | null
  relatedConsumableId?: string | null
  problem: string
  issueTypes?: string[]
  probableErrorType?: CorrectiveErrorType | null
  probableErrorNote?: string | null
  reviewFindings?: Record<string, unknown> | null
  rootCause?: string | null
  actionTypes?: string[]
  actionTaken?: string | null
  correctionOutcome?: CorrectiveCorrectionOutcome | null
  correctionOutcomeNote?: string | null
  preventiveAction?: string | null
  ownerId?: string | null
  dueDate?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  if (!input.problem.trim()) throw new HttpError(400, 'Problem description is required')
  const admin = getAdminClient()
  if (input.resultId) {
    const { data: linkedResult, error: linkedResultError } = await admin.from('iqc_result_values').select('run_id,analyte_id').eq('id', input.resultId).maybeSingle()
    fail(linkedResultError)
    if (!linkedResult) throw new HttpError(400, 'IQC result not found')
    const linked = linkedResult as RecordRow
    if (asString(linked.run_id) !== input.runId) throw new HttpError(400, 'IQC result does not belong to the selected run')
    if (input.analyteId && asString(linked.analyte_id) !== input.analyteId) throw new HttpError(400, 'IQC result does not belong to the selected analyte')
  }
  let existingQuery = admin.from('iqc_corrective_actions').select('id').eq('run_id', input.runId).limit(1)
  if (input.resultId) existingQuery = existingQuery.eq('result_id', input.resultId)
  else if (input.analyteId) existingQuery = existingQuery.eq('analyte_id', input.analyteId).is('result_id', null)
  else existingQuery = existingQuery.is('analyte_id', null).is('result_id', null)
  {
    const { data: existing, error: existingError } = await existingQuery.maybeSingle()
    fail(existingError)
    if (existing) return getIqcWorkspace(actor)
  }
  // Rows created before result_id was introduced were run/analyte-scoped.
  // Treat that legacy scope as the same context when a graph click supplies
  // the now-preferred exact result link.
  if (input.resultId && input.analyteId) {
    const { data: legacy, error: legacyError } = await admin.from('iqc_corrective_actions').select('id').eq('run_id', input.runId).eq('analyte_id', input.analyteId).is('result_id', null).limit(1).maybeSingle()
    fail(legacyError)
    if (legacy) return getIqcWorkspace(actor)
  }
  if (input.resultId) {
    const { data: legacyRun, error: legacyRunError } = await admin.from('iqc_corrective_actions').select('id').eq('run_id', input.runId).is('analyte_id', null).is('result_id', null).limit(1).maybeSingle()
    fail(legacyRunError)
    if (legacyRun) return getIqcWorkspace(actor)
  }
  const { data, error } = await admin.from('iqc_corrective_actions').insert({
    run_id: input.runId,
    result_id: input.resultId || null,
    analyte_id: input.analyteId || null,
    related_consumable_id: input.relatedConsumableId || null,
    problem: input.problem.trim(),
    issue_types: input.issueTypes ?? [],
    probable_error_type: input.probableErrorType || null,
    probable_error_note: clean(input.probableErrorNote),
    review_findings: input.reviewFindings ?? {},
    root_cause: clean(input.rootCause),
    action_types: input.actionTypes ?? [],
    action_taken: clean(input.actionTaken),
    correction_outcome: input.correctionOutcome || null,
    correction_outcome_note: clean(input.correctionOutcomeNote),
    preventive_action: clean(input.preventiveAction),
    owner_id: input.ownerId || null,
    due_date: input.dueDate || null,
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.create', 'iqc-corrective-action', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function updateCorrectiveAction(id: string, input: {
  problem?: string
  issueTypes?: string[]
  probableErrorType?: CorrectiveErrorType | null
  probableErrorNote?: string | null
  reviewFindings?: Record<string, unknown> | null
  rootCause?: string | null
  actionTypes?: string[]
  actionTaken?: string | null
  correctionOutcome?: CorrectiveCorrectionOutcome | null
  correctionOutcomeNote?: string | null
  preventiveAction?: string | null
  ownerId?: string | null
  dueDate?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_corrective_actions')
    .select('status')
    .eq('id', id)
    .maybeSingle()
  fail(existingError)
  if (!existing) throw new HttpError(404, 'Corrective action not found')
  if (asString((existing as RecordRow).status) === 'closed') throw new HttpError(400, 'Closed corrective action cannot be edited')

  const update: Record<string, unknown> = {}
  if (input.problem !== undefined) {
    const problem = input.problem.trim()
    if (!problem) throw new HttpError(400, 'Problem description is required')
    update.problem = problem
  }
  if (input.issueTypes !== undefined) update.issue_types = input.issueTypes
  if (input.probableErrorType !== undefined) update.probable_error_type = input.probableErrorType || null
  if (input.probableErrorNote !== undefined) update.probable_error_note = clean(input.probableErrorNote)
  if (input.reviewFindings !== undefined) update.review_findings = input.reviewFindings ?? {}
  if (input.rootCause !== undefined) update.root_cause = clean(input.rootCause)
  if (input.actionTypes !== undefined) update.action_types = input.actionTypes
  if (input.actionTaken !== undefined) update.action_taken = clean(input.actionTaken)
  if (input.correctionOutcome !== undefined) update.correction_outcome = input.correctionOutcome || null
  if (input.correctionOutcomeNote !== undefined) update.correction_outcome_note = clean(input.correctionOutcomeNote)
  if (input.preventiveAction !== undefined) update.preventive_action = clean(input.preventiveAction)
  if (input.ownerId !== undefined) update.owner_id = input.ownerId || null
  if (input.dueDate !== undefined) update.due_date = input.dueDate || null
  if (!Object.keys(update).length) throw new HttpError(400, 'No changes provided')

  const { error } = await admin.from('iqc_corrective_actions').update(update).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.update', 'iqc-corrective-action', id, input)
  return getIqcWorkspace(actor)
}

export async function closeCorrectiveAction(id: string, input: CorrectiveActionFields & { effectivenessOutcome?: 'effective' | 'ineffective' | null; effectivenessNote?: string | null }, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_corrective_actions')
    .select('problem,issue_types,probable_error_type,probable_error_note,review_findings,root_cause,action_types,action_taken,correction_outcome,correction_outcome_note,preventive_action,status,owner_id,due_date')
    .eq('id', id)
    .maybeSingle()
  fail(existingError)
  if (!existing) throw new HttpError(404, 'Corrective action not found')
  if (asString((existing as RecordRow).status) === 'closed') throw new HttpError(400, 'Corrective action is already closed')

  const draft: Partial<CorrectiveActionDraft> = {
    problem: input.problem ?? asString((existing as RecordRow).problem),
    issueTypes: input.issueTypes ?? stringArray((existing as RecordRow).issue_types),
    probableErrorType: input.probableErrorType ?? ((existing as RecordRow).probable_error_type as CorrectiveErrorType | null) ?? undefined,
    probableErrorNote: input.probableErrorNote ?? nullableString((existing as RecordRow).probable_error_note) ?? '',
    reviewFindings: input.reviewFindings ?? normalizeReviewFindings((existing as RecordRow).review_findings, 'iqc'),
    rootCause: input.rootCause ?? nullableString((existing as RecordRow).root_cause) ?? '',
    actionTypes: input.actionTypes ?? stringArray((existing as RecordRow).action_types),
    actionTaken: input.actionTaken ?? nullableString((existing as RecordRow).action_taken) ?? '',
    correctionOutcome: input.correctionOutcome ?? ((existing as RecordRow).correction_outcome as CorrectiveActionDraft['correctionOutcome']),
    correctionOutcomeNote: input.correctionOutcomeNote ?? nullableString((existing as RecordRow).correction_outcome_note) ?? '',
    preventiveAction: input.preventiveAction ?? nullableString((existing as RecordRow).preventive_action) ?? '',
    ownerId: input.ownerId ?? nullableString((existing as RecordRow).owner_id) ?? '',
    dueDate: input.dueDate ?? nullableString((existing as RecordRow).due_date) ?? '',
  }
  const validation = validateCorrectiveAction(draft, 'iqc', 'complete')
  if (validation.length) throw new HttpError(400, validation.map((issue) => issue.message).join(' | '))
  const rootCause = clean(draft.rootCause)
  const actionTaken = clean(draft.actionTaken)

  const outcome = input.effectivenessOutcome ?? null
  const note = clean(input.effectivenessNote)
  if (outcome && !note) throw new HttpError(400, 'Effectiveness note is required')
  const update: Record<string, unknown> = {
    root_cause: rootCause,
    action_taken: actionTaken,
    issue_types: draft.issueTypes ?? [],
    probable_error_type: draft.probableErrorType || null,
    probable_error_note: clean(draft.probableErrorNote),
    review_findings: draft.reviewFindings ?? {},
    action_types: draft.actionTypes ?? [],
    correction_outcome: draft.correctionOutcome || null,
    correction_outcome_note: clean(draft.correctionOutcomeNote),
    preventive_action: clean(draft.preventiveAction),
    owner_id: draft.ownerId || null,
    due_date: draft.dueDate || null,
  }
  if (!outcome) {
    update.status = 'awaiting-effectiveness'
  } else if (outcome === 'effective') {
    update.status = 'closed'
    update.effectiveness_outcome = outcome
    update.effectiveness_note = note
    update.effectiveness_verified_by = actor.id
    update.effectiveness_verified_at = new Date().toISOString()
    update.closed_by = actor.id
    update.closed_at = new Date().toISOString()
  } else {
    update.status = 'open'
    update.effectiveness_outcome = outcome
    update.effectiveness_note = note
    update.effectiveness_verified_by = actor.id
    update.effectiveness_verified_at = new Date().toISOString()
  }
  const { error } = await admin.from('iqc_corrective_actions').update(update).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.close', 'iqc-corrective-action', id, { ...input })
  return getIqcWorkspace(actor)
}

export async function deleteCorrectiveAction(id: string, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_corrective_actions')
    .select('run_id,problem,status')
    .eq('id', id)
    .maybeSingle()
  fail(existingError)
  if (!existing) throw new HttpError(404, 'Corrective action not found')

  const attachmentCount = await deleteEntityAttachments({ module: 'iqc', entityType: 'corrective-action', entityId: id })
  const { error } = await admin.from('iqc_corrective_actions').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.delete', 'iqc-corrective-action', id, {
    runId: asString((existing as RecordRow).run_id),
    problem: asString((existing as RecordRow).problem),
    status: asString((existing as RecordRow).status),
    attachmentCount,
  })
  return getIqcWorkspace(actor)
}
