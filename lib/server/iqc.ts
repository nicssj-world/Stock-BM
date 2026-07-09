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
  IqcControlLot,
  IqcControlMaterial,
  IqcCorrectiveAction,
  IqcInstrument,
  IqcLotChangeMarker,
  IqcRun,
  IqcSixSigmaRow,
  IqcSpec,
  IqcTeaSpec,
  IqcUncertaintyBudget,
  IqcUncertaintyComponent,
  IqcWorkspace,
  TeaMode,
  Distribution,
  UncertaintySource,
} from '@/lib/iqc/types'
import { LAB_LOCK_MIN_POINTS } from '@/lib/iqc/types'
import { cv, evaluateLatest, mean, sd, toStat, type QcStatus } from '@/lib/iqc/westgard'
import { sigmaRating, sixSigma, teaPercent } from '@/lib/iqc/sixsigma'
import { combinedRelative, divisorFor, expandedRelative, pooledRsd, relativeStandardUncertainty, standardUncertainty } from '@/lib/iqc/uncertainty'
import type { BmActor } from '@/lib/bm/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'IQC database operation failed') {
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
  return { id: asString(row.id), code: asString(row.code), name: asString(row.name), model: nullableString(row.model), isActive: Boolean(row.is_active) }
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
  }
}

function activeStats(spec: IqcSpec | undefined): { meanValue: number | null; sdValue: number | null } {
  if (!spec) return { meanValue: null, sdValue: null }
  if (spec.activeLimit === 'lab') return { meanValue: spec.labMean, sdValue: spec.labSd }
  return { meanValue: spec.assignedMean, sdValue: spec.assignedSd }
}

export async function getIqcWorkspace(actor: BmActor): Promise<IqcWorkspace> {
  void actor
  const admin = getAdminClient()
  const [
    { data: analyteData, error: analyteError },
    { data: instrumentData, error: instrumentError },
    { data: materialData, error: materialError },
    { data: lotData, error: lotError },
    { data: specData, error: specError },
    { data: runData, error: runError },
    { data: consumableData, error: consumableError },
    { data: valueData, error: valueError },
    { data: caData, error: caError },
    { data: teaData, error: teaError },
    { data: budgetData, error: budgetError },
  ] = await Promise.all([
    admin.from('iqc_analytes').select('*').order('group_label', { nullsFirst: true }).order('code'),
    admin.from('iqc_instruments').select('*').order('code'),
    admin.from('iqc_control_materials').select('*').order('name'),
    admin.from('iqc_control_lots').select('*').order('created_at', { ascending: false }),
    admin.from('iqc_control_specs').select('*'),
    admin.from('iqc_runs').select('*').order('run_datetime', { ascending: false }).limit(500),
    admin.from('iqc_run_consumables').select('*'),
    admin.from('iqc_result_values').select('*').limit(5000),
    admin.from('iqc_corrective_actions').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('iqc_tea_specs').select('*').eq('is_active', true),
    admin.from('iqc_uncertainty_budgets').select('*, iqc_uncertainty_components(*)').order('evaluated_at', { ascending: false }),
  ])
  fail(analyteError)
  fail(instrumentError)
  fail(materialError)
  fail(lotError)
  fail(specError)
  fail(runError)
  fail(consumableError)
  fail(valueError)
  fail(caError)
  fail(teaError)
  fail(budgetError)

  const analytes = ((analyteData ?? []) as RecordRow[]).map(mapAnalyte)
  const instruments = ((instrumentData ?? []) as RecordRow[]).map(mapInstrument)
  const controlMaterials = ((materialData ?? []) as RecordRow[]).map(mapMaterial)
  const materialMap = new Map(controlMaterials.map((m) => [m.id, m]))
  const lotRows = (lotData ?? []) as RecordRow[]
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
    }
  })
  const lotMap = new Map(controlLots.map((lot) => [lot.id, lot]))
  const specs = ((specData ?? []) as RecordRow[]).map(mapSpec)
  const specByKey = new Map(specs.map((spec) => [`${spec.controlLotId}:${spec.analyteId}`, spec]))
  const analyteMap = new Map(analytes.map((a) => [a.id, a]))

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
  const instrumentMap = new Map(instruments.map((i) => [i.id, i]))
  const consumableRows = (consumableData ?? []) as RecordRow[]
  const consumablesByRun = new Map<string, RecordRow[]>()
  for (const row of consumableRows) {
    const runId = asString(row.run_id)
    consumablesByRun.set(runId, [...(consumablesByRun.get(runId) ?? []), row])
  }
  const valueRows = (valueData ?? []) as RecordRow[]
  const nameMap = await getNameMap([
    ...runRows.map((r) => asString(r.entered_by)),
    ...((caData ?? []) as RecordRow[]).flatMap((r) => [asString(r.created_by), asString(r.closed_by)]),
  ])

  // ---- Charts: one per (control_lot x analyte) ----
  const groups = new Map<string, RecordRow[]>()
  for (const row of valueRows) {
    const key = `${asString(row.control_lot_id)}:${asString(row.analyte_id)}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const charts: IqcChart[] = []
  for (const [key, rows] of groups) {
    const [controlLotId, analyteId] = key.split(':')
    const analyte = analyteMap.get(analyteId)
    const lot = lotMap.get(controlLotId)
    if (!analyte || !lot) continue
    const spec = specByKey.get(key)
    const { meanValue, sdValue } = activeStats(spec)

    const ordered = rows
      .map((row) => ({ row, when: runDatetime.get(asString(row.run_id)) ?? asString(row.created_at) }))
      .sort((a, b) => a.when.localeCompare(b.when))

    const points: IqcChartPoint[] = ordered.map(({ row, when }) => ({
      resultId: asString(row.id),
      runId: asString(row.run_id),
      runDatetime: when,
      value: Number(row.numeric_value ?? 0),
      statValue: Number(row.stat_value ?? row.numeric_value ?? 0),
      z: Number(row.z_score ?? 0),
      status: asString(row.status) as QcStatus,
      violatedRules: Array.isArray(row.violated_rules) ? (row.violated_rules as string[]) : [],
      isVoided: Boolean(row.is_voided),
    }))

    const usable = points.filter((p) => !p.isVoided).map((p) => p.statValue)
    const lockEligible = usable.length >= LAB_LOCK_MIN_POINTS
    const latest = [...points].reverse().find((p) => !p.isVoided)

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
      analyteCode: analyte.code,
      analyteName: analyte.name,
      groupLabel: analyte.groupLabel,
      scale: analyte.scale,
      dataType: analyte.dataType,
      unit: analyte.unit,
      level: lot.level,
      controlMaterialName: lot.controlMaterialName,
      lotNumber: lot.lotNumber,
      activeLimit: spec?.activeLimit ?? 'assigned',
      mean: meanValue,
      sd: sdValue,
      cv: meanValue && sdValue ? (sdValue / Math.abs(meanValue)) * 100 : null,
      n: usable.length,
      assignedMean: spec?.assignedMean ?? null,
      assignedSd: spec?.assignedSd ?? null,
      labMean: spec?.labMean ?? null,
      labSd: spec?.labSd ?? null,
      labN: spec?.labN ?? null,
      labLockedAt: spec?.labLockedAt ?? null,
      lockEligible,
      status: latest?.status ?? 'accepted',
      points,
      lotChanges,
      currentConsumables,
    })
  }
  charts.sort((a, b) => {
    const rank = { rejected: 0, warning: 1, accepted: 2 }
    return rank[a.status] - rank[b.status] || a.analyteCode.localeCompare(b.analyteCode)
  })

  // ---- Six Sigma rows (per chart that has a TEa spec + stats). Bias from EQA = 0 until wired. ----
  const sixSigmaRows: IqcSixSigmaRow[] = []
  for (const chart of charts) {
    const tea = teaByAnalyte.get(chart.analyteId)
    if (!tea) continue
    const teaPct = chart.mean != null ? teaPercent(tea.teaValue, tea.teaMode, chart.mean) : null
    const biasPct = 0
    const sigma = teaPct != null && chart.cv != null ? sixSigma(teaPct, biasPct, chart.cv) : null
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
        return {
          analyteId: asString(value.analyte_id),
          analyteCode: analyte?.code ?? '-',
          analyteName: analyte?.name ?? '-',
          controlLotId: asString(value.control_lot_id),
          numericValue: nullableNumber(value.numeric_value),
          qualitativeValue: nullableString(value.qualitative_value),
          z: nullableNumber(value.z_score),
          violatedRules: Array.isArray(value.violated_rules) ? (value.violated_rules as string[]) : [],
          status: asString(value.status) as QcStatus,
          isVoided: Boolean(value.is_voided),
        }
      }),
    }
  })

  const correctiveActions: IqcCorrectiveAction[] = ((caData ?? []) as RecordRow[]).map((row) => {
    const analyte = row.analyte_id ? analyteMap.get(asString(row.analyte_id)) : undefined
    return {
      id: asString(row.id),
      runId: asString(row.run_id),
      runDatetime: runDatetime.get(asString(row.run_id)) ?? asString(row.created_at),
      analyteId: nullableString(row.analyte_id),
      analyteName: analyte?.name ?? null,
      problem: asString(row.problem),
      rootCause: nullableString(row.root_cause),
      actionTaken: nullableString(row.action_taken),
      status: asString(row.status) === 'closed' ? 'closed' : 'open',
      createdByName: nameMap.get(asString(row.created_by)) ?? null,
      createdAt: asString(row.created_at),
      closedByName: row.closed_by ? nameMap.get(asString(row.closed_by)) ?? null : null,
      closedAt: nullableString(row.closed_at),
    }
  })

  return {
    analytes,
    instruments,
    controlMaterials,
    controlLots,
    specs,
    teaSpecs,
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
      openCorrectiveActions: correctiveActions.filter((c) => c.status === 'open').length,
    },
  }
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
    scale: input.scale,
    is_absolute: Boolean(input.isAbsolute),
    unit: clean(input.unit),
    group_label: clean(input.groupLabel),
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
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.code !== undefined) payload.code = input.code.trim()
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.dataType !== undefined) payload.data_type = input.dataType
  if (input.scale !== undefined) payload.scale = input.scale
  if (input.isAbsolute !== undefined) payload.is_absolute = Boolean(input.isAbsolute)
  if (input.unit !== undefined) payload.unit = clean(input.unit)
  if (input.groupLabel !== undefined) payload.group_label = clean(input.groupLabel)
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { error } = await getAdminClient().from('iqc_analytes').update(payload).eq('id', id)
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
  const { data, error } = await getAdminClient().from('iqc_control_lots').insert({
    control_material_id: input.controlMaterialId,
    lot_number: input.lotNumber.trim(),
    expiry_date: input.expiryDate || null,
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
  if (input.controlMaterialId !== undefined) payload.control_material_id = input.controlMaterialId
  if (input.lotNumber !== undefined) payload.lot_number = input.lotNumber.trim()
  if (input.expiryDate !== undefined) payload.expiry_date = input.expiryDate || null
  if (input.stockLotId !== undefined) payload.stock_lot_id = input.stockLotId || null
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
      { table: 'iqc_result_values', column: 'analyte_id' },
      { table: 'iqc_corrective_actions', column: 'analyte_id' },
      { table: 'iqc_tea_specs', column: 'analyte_id' },
      { table: 'iqc_uncertainty_budgets', column: 'analyte_id' },
      { table: 'lotverif_measurements', column: 'analyte_id' },
    ], id, IQC_DELETE_MESSAGE)
  } else if (entity === 'instrument') {
    await assertNoIqcReferences([{ table: 'iqc_runs', column: 'instrument_id' }], id, IQC_DELETE_MESSAGE)
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
    { table: 'iqc_result_values', column: 'control_lot_id' },
    { table: 'lotverif_verifications', column: 'new_control_lot_id' },
    { table: 'lotverif_verifications', column: 'old_control_lot_id' },
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
}, actor: BmActor) {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('iqc_control_specs')
    .select('id')
    .eq('control_lot_id', input.controlLotId)
    .eq('analyte_id', input.analyteId)
    .maybeSingle()
  fail(existingError)
  const payload = {
    assigned_mean: input.assignedMean ?? null,
    assigned_sd: input.assignedSd ?? null,
    expected_qualitative: clean(input.expectedQualitative),
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
  await writeAudit(actor, 'iqc.spec.upsert', 'iqc-control-spec', `${input.controlLotId}:${input.analyteId}`, input)
  return getIqcWorkspace(actor)
}

export async function createTeaSpec(input: {
  analyteId: string
  teaValue: number
  teaMode: TeaMode
  teaUnit?: string | null
  sourceRef?: string | null
}, actor: BmActor) {
  assertAdmin(actor)
  // Deactivate any prior active TEa for this analyte so only one is current.
  const admin = getAdminClient()
  const { error: deactivateError } = await admin
    .from('iqc_tea_specs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('analyte_id', input.analyteId)
    .eq('is_active', true)
  fail(deactivateError)
  const { data, error } = await admin.from('iqc_tea_specs').insert({
    analyte_id: input.analyteId,
    tea_value: input.teaValue,
    tea_mode: input.teaMode,
    tea_unit: clean(input.teaUnit),
    source_ref: clean(input.sourceRef),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.tea.create', 'iqc-tea-spec', asString((data as RecordRow).id), input)
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

export async function createRun(input: {
  instrumentId?: string | null
  runNo?: number | null
  runDatetime?: string | null
  note?: string | null
  consumables?: { kind: ConsumableKind; lotNumber: string; stockLotId?: string | null; appliesScope?: ConsumableScope; beadCountPerTube?: number | null }[]
  values: { controlLotId: string; analyteId: string; numericValue?: number | null; qualitativeValue?: string | null }[]
}, actor: BmActor) {
  if (!input.values.length) throw new HttpError(400, 'At least one result value is required')
  const admin = getAdminClient()

  const analyteIds = [...new Set(input.values.map((v) => v.analyteId))]
  const lotIds = [...new Set(input.values.map((v) => v.controlLotId))]
  const [{ data: analyteRows, error: aErr }, { data: specRows, error: sErr }, { data: priorRows, error: pErr }] = await Promise.all([
    admin.from('iqc_analytes').select('*').in('id', analyteIds),
    admin.from('iqc_control_specs').select('*').in('control_lot_id', lotIds).in('analyte_id', analyteIds),
    admin
      .from('iqc_result_values')
      .select('control_lot_id,analyte_id,stat_value,status,is_voided,iqc_runs(run_datetime)')
      .in('control_lot_id', lotIds)
      .in('analyte_id', analyteIds),
  ])
  fail(aErr)
  fail(sErr)
  fail(pErr)
  const analyteById = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), mapAnalyte(row)]))
  const specByKey = new Map(((specRows ?? []) as RecordRow[]).map((row) => [`${asString(row.control_lot_id)}:${asString(row.analyte_id)}`, mapSpec(row)]))

  const priorByKey = new Map<string, { stat: number; when: string }[]>()
  for (const row of (priorRows ?? []) as RecordRow[]) {
    if (Boolean(row.is_voided) || asString(row.status) === 'rejected') continue
    if (row.stat_value == null) continue
    const key = `${asString(row.control_lot_id)}:${asString(row.analyte_id)}`
    const runRef = row.iqc_runs as RecordRow | null
    priorByKey.set(key, [...(priorByKey.get(key) ?? []), { stat: Number(row.stat_value), when: asString(runRef?.run_datetime) }])
  }

  // Insert the run
  const { data: runData, error: runError } = await admin.from('iqc_runs').insert({
    instrument_id: input.instrumentId || null,
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
        lot_number: c.lotNumber.trim(),
        stock_lot_id: c.stockLotId || null,
        applies_scope: c.appliesScope ?? 'all',
        bead_count_per_tube: c.beadCountPerTube ?? null,
      })),
    )
    fail(consError)
  }

  const valueRows = input.values.map((value) => {
    const analyte = analyteById.get(value.analyteId)
    const key = `${value.controlLotId}:${value.analyteId}`
    const spec = specByKey.get(key)
    if (analyte?.dataType === 'qualitative') {
      const expected = spec?.expectedQualitative
      const status: QcStatus = expected && value.qualitativeValue && expected.trim().toLowerCase() !== value.qualitativeValue.trim().toLowerCase() ? 'rejected' : 'accepted'
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
      }
    }
    const numeric = value.numericValue ?? null
    const scale = analyte?.scale ?? 'linear'
    if (numeric == null) throw new HttpError(400, `Numeric value required for ${analyte?.code ?? 'analyte'}`)
    if (scale === 'log10' && numeric <= 0) throw new HttpError(400, `${analyte?.code} value must be > 0 for log scale`)
    const statValue = toStat(numeric, scale)
    const { meanValue, sdValue } = activeStats(spec)
    let z: number | null = null
    let violated: string[] = []
    let status: QcStatus = 'accepted'
    if (meanValue != null && sdValue != null && sdValue > 0) {
      const series = [...(priorByKey.get(key) ?? [])]
        .sort((a, b) => a.when.localeCompare(b.when))
        .map((p) => p.stat)
      series.push(statValue)
      const point = evaluateLatest(series, meanValue, sdValue)
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
    }
  })

  const { error: valueError } = await admin.from('iqc_result_values').insert(valueRows)
  if (valueError) {
    await admin.from('iqc_runs').delete().eq('id', runId)
    throw new HttpError(400, valueError.message || 'Could not save run results')
  }

  await writeAudit(actor, 'iqc.run.create', 'iqc-run', runId, {
    runDatetime: runWhen,
    values: valueRows.map((v) => ({ analyteId: v.analyte_id, status: v.status, rules: v.violated_rules })),
  })
  return getIqcWorkspace(actor)
}

// Bulk import: one run per row (chronological), evaluating Westgard as the series
// grows — used by the UI paste-import and matches single-run entry semantics.
export async function importIqcRuns(input: {
  controlLotId: string
  analyteIds: string[]
  trucountLot?: string | null
  rows: { runDatetime: string; values: (number | null)[] }[]
}, actor: BmActor) {
  if (!input.analyteIds.length) throw new HttpError(400, 'Select at least one analyte column')
  if (!input.rows.length) throw new HttpError(400, 'No rows to import')
  const admin = getAdminClient()

  const [{ data: analyteRows, error: aErr }, { data: specRows, error: sErr }, { data: priorRows, error: pErr }] = await Promise.all([
    admin.from('iqc_analytes').select('*').in('id', input.analyteIds),
    admin.from('iqc_control_specs').select('*').eq('control_lot_id', input.controlLotId).in('analyte_id', input.analyteIds),
    admin
      .from('iqc_result_values')
      .select('analyte_id,stat_value,status,is_voided,iqc_runs(run_datetime)')
      .eq('control_lot_id', input.controlLotId)
      .in('analyte_id', input.analyteIds),
  ])
  fail(aErr)
  fail(sErr)
  fail(pErr)
  const analyteById = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), mapAnalyte(row)]))
  const specByAnalyte = new Map(((specRows ?? []) as RecordRow[]).map((row) => [asString(row.analyte_id), mapSpec(row)]))

  const seriesByAnalyte = new Map<string, number[]>()
  const priorSorted = ((priorRows ?? []) as RecordRow[])
    .filter((row) => !Boolean(row.is_voided) && asString(row.status) !== 'rejected' && row.stat_value != null)
    .map((row) => ({ analyteId: asString(row.analyte_id), stat: Number(row.stat_value), when: asString((row.iqc_runs as RecordRow | null)?.run_datetime) }))
    .sort((a, b) => a.when.localeCompare(b.when))
  for (const p of priorSorted) seriesByAnalyte.set(p.analyteId, [...(seriesByAnalyte.get(p.analyteId) ?? []), p.stat])

  const sortedRows = [...input.rows].sort((a, b) => a.runDatetime.localeCompare(b.runDatetime))
  let imported = 0
  for (const row of sortedRows) {
    const { data: runData, error: runError } = await admin
      .from('iqc_runs')
      .insert({ run_datetime: row.runDatetime, entered_by: actor.id })
      .select('id')
      .single()
    fail(runError)
    const runId = asString((runData as RecordRow).id)

    if (input.trucountLot?.trim()) {
      await admin.from('iqc_run_consumables').insert({ run_id: runId, kind: 'trucount-tube', lot_number: input.trucountLot.trim(), applies_scope: 'absolute-only' })
    }

    const valueRows: RecordRow[] = []
    row.values.forEach((value, index) => {
      if (value == null) return
      const analyteId = input.analyteIds[index]
      const analyte = analyteById.get(analyteId)
      const scale = analyte?.scale ?? 'linear'
      if (scale === 'log10' && value <= 0) return
      const statValue = toStat(value, scale)
      const { meanValue, sdValue } = activeStats(specByAnalyte.get(analyteId))
      let z: number | null = null
      let violated: string[] = []
      let status: QcStatus = 'accepted'
      if (meanValue != null && sdValue != null && sdValue > 0) {
        const series = [...(seriesByAnalyte.get(analyteId) ?? []), statValue]
        const point = evaluateLatest(series, meanValue, sdValue)
        z = point.z
        violated = point.violatedRules
        status = point.status
        if (status !== 'rejected') seriesByAnalyte.set(analyteId, series)
      } else {
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

  await writeAudit(actor, 'iqc.import', 'iqc-control-lot', input.controlLotId, { imported, analyteIds: input.analyteIds })
  return getIqcWorkspace(actor)
}

export async function voidResult(resultId: string, reason: string, actor: BmActor) {
  if (!reason.trim()) throw new HttpError(400, 'Void reason is required')
  const { error } = await getAdminClient()
    .from('iqc_result_values')
    .update({ is_voided: true, void_reason: reason.trim() })
    .eq('id', resultId)
  fail(error)
  await writeAudit(actor, 'iqc.result.void', 'iqc-result', resultId, { reason: reason.trim() })
  return getIqcWorkspace(actor)
}

export async function lockLabStatistics(controlLotId: string, analyteId: string, actor: BmActor, overrideReason?: string | null) {
  assertAdmin(actor)
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
  if (usable.length < 2) {
    throw new HttpError(400, `ต้องมีอย่างน้อย 2 จุดจึงคำนวณ SD ได้ (ตอนนี้ ${usable.length})`)
  }
  const overridden = usable.length < LAB_LOCK_MIN_POINTS
  if (overridden && !overrideReason?.trim()) {
    throw new HttpError(400, `ต้องมีอย่างน้อย ${LAB_LOCK_MIN_POINTS} จุดก่อน lock (ตอนนี้ ${usable.length}) — หรือระบุเหตุผล override`)
  }
  const labMean = mean(usable)
  const labSd = sd(usable)

  const { data: existing, error: existingError } = await admin
    .from('iqc_control_specs')
    .select('id')
    .eq('control_lot_id', controlLotId)
    .eq('analyte_id', analyteId)
    .maybeSingle()
  fail(existingError)
  const payload = {
    lab_mean: labMean,
    lab_sd: labSd,
    lab_n: usable.length,
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
  await writeAudit(actor, 'iqc.spec.lockLab', 'iqc-control-spec', `${controlLotId}:${analyteId}`, {
    labMean,
    labSd,
    labN: usable.length,
    overridden,
    overrideReason: overridden ? overrideReason?.trim() : null,
  })
  return getIqcWorkspace(actor)
}

export async function createCorrectiveAction(input: {
  runId: string
  analyteId?: string | null
  relatedConsumableId?: string | null
  problem: string
  rootCause?: string | null
  actionTaken?: string | null
}, actor: BmActor) {
  if (!input.problem.trim()) throw new HttpError(400, 'Problem description is required')
  const { data, error } = await getAdminClient().from('iqc_corrective_actions').insert({
    run_id: input.runId,
    analyte_id: input.analyteId || null,
    related_consumable_id: input.relatedConsumableId || null,
    problem: input.problem.trim(),
    root_cause: clean(input.rootCause),
    action_taken: clean(input.actionTaken),
    created_by: actor.id,
  }).select('id').single()
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.create', 'iqc-corrective-action', asString((data as RecordRow).id), input)
  return getIqcWorkspace(actor)
}

export async function closeCorrectiveAction(id: string, input: { rootCause?: string | null; actionTaken?: string | null }, actor: BmActor) {
  const { error } = await getAdminClient().from('iqc_corrective_actions').update({
    root_cause: clean(input.rootCause),
    action_taken: clean(input.actionTaken),
    status: 'closed',
    closed_by: actor.id,
    closed_at: new Date().toISOString(),
  }).eq('id', id)
  fail(error)
  await writeAudit(actor, 'iqc.correctiveAction.close', 'iqc-corrective-action', id, input)
  return getIqcWorkspace(actor)
}
