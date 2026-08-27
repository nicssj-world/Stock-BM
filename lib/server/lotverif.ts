import 'server-only'

import type {
  LotOption,
  LotVerifAnalyte,
  LotVerifControlStat,
  LotVerifInstrument,
  LotVerifMeasurement,
  LotVerifMethod,
  LotVerifParallelRow,
  LotVerifParallelSummary,
  LotVerifStatus,
  LotVerifSubjectKind,
  LotVerifUnlinkedEquipment,
  LotVerification,
  LotVerifWorkspace,
} from '@/lib/lotverif/types'
import { calculateParallelComparison, difference, percentDiff, withinCriteria, type ParallelControlInput } from '@/lib/lotverif/compare'
import type { AnalyteScale } from '@/lib/iqc/westgard'
import type { BmActor } from '@/lib/bm/types'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function fail(error: { message: string } | null, message = 'Lot verification database operation failed') {
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
function nullableBool(value: unknown) {
  return value == null ? null : Boolean(value)
}
function clean(value: string | null | undefined) {
  return value?.trim() || null
}

function stockItemCategoryName(item: RecordRow | undefined) {
  const category = item?.bm_stock_categories
  if (Array.isArray(category)) return asString((category[0] as RecordRow | undefined)?.name)
  return category && typeof category === 'object' ? asString((category as RecordRow).name) : ''
}

function isReagentStockItem(item: RecordRow | undefined) {
  return stockItemCategoryName(item).trim().toLowerCase() === 'reagent'
}
function isVlQuantitativeAnalyte(analyte: RecordRow | undefined) {
  return asString(analyte?.data_type) === 'quantitative' && /-VL\b/i.test(asString(analyte?.code))
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

function mapMeasurement(row: RecordRow): LotVerifMeasurement {
  return {
    id: asString(row.id),
    verificationId: asString(row.verification_id),
    analyteId: nullableString(row.analyte_id),
    analyteLabel: nullableString(row.analyte_label),
    sampleLabel: nullableString(row.sample_label),
    oldValue: nullableNumber(row.old_value),
    newValue: nullableNumber(row.new_value),
    difference: nullableNumber(row.difference),
    percentDiff: nullableNumber(row.percent_diff),
    withinCriteria: nullableBool(row.within_criteria),
    oldQualitative: nullableString(row.old_qualitative),
    newQualitative: nullableString(row.new_qualitative),
    concordant: nullableBool(row.concordant),
    note: nullableString(row.note),
  }
}

function asScale(value: unknown): AnalyteScale {
  return value === 'log10' ? 'log10' : 'linear'
}

function mapParallelRow(row: RecordRow): LotVerifParallelRow {
  const source = asString(row.stats_source)
  return {
    id: asString(row.id),
    verificationId: asString(row.verification_id),
    level: Number(row.level_no),
    controlLotId: nullableString(row.control_lot_id),
    controlLabel: nullableString(row.control_label),
    controlMean: nullableNumber(row.control_mean),
    controlSd: nullableNumber(row.control_sd),
    statsSource: source === 'assigned' || source === 'lab' || source === 'baseline' ? source : 'manual',
    oldRun1: nullableNumber(row.old_run_1),
    oldRun2: nullableNumber(row.old_run_2),
    newRun1: nullableNumber(row.new_run_1),
    newRun2: nullableNumber(row.new_run_2),
    currentMean: nullableNumber(row.current_mean),
    newMean: nullableNumber(row.new_mean),
    difference: nullableNumber(row.difference),
    percentDiff: nullableNumber(row.percent_diff),
    cvPercent: nullableNumber(row.cv_percent),
  }
}

function mapParallelSummary(
  calculation: ReturnType<typeof calculateParallelComparison>,
  unit: string | null,
): LotVerifParallelSummary {
  return {
    scale: calculation.scale,
    unit,
    limit: calculation.limit,
    currentMean: calculation.currentMean,
    newMean: calculation.newMean,
    allSampleMean: calculation.allSampleMean,
    selectedLevel: calculation.selectedLevel,
    selectedCvPercent: calculation.selectedCvPercent,
    selectedCvDecimal: calculation.selectedCvDecimal,
    signedIndex: calculation.signedIndex,
    index: calculation.index,
    passed: calculation.passed,
    reason: calculation.reason,
  }
}

function activeControlStat(row: RecordRow): { mean: number | null; sd: number | null; source: 'assigned' | 'lab' } {
  const assignedMean = nullableNumber(row.assigned_mean)
  const assignedSd = nullableNumber(row.assigned_sd)
  const labMean = nullableNumber(row.lab_mean)
  const labSd = nullableNumber(row.lab_sd)
  const labLocked = Boolean(row.lab_locked_at) && labMean != null && labSd != null
  if (asString(row.active_limit) === 'lab' && labLocked) return { mean: labMean, sd: labSd, source: 'lab' }
  return { mean: assignedMean, sd: assignedSd, source: 'assigned' }
}

// Build display labels for the lots referenced by a verification.
async function loadLotLabels(): Promise<{ reagent: Map<string, string>; control: Map<string, string> }> {
  const admin = getAdminClient()
  const [{ data: lotRows, error: lotError }, { data: ctrlRows, error: ctrlError }] = await Promise.all([
    admin.from('bm_stock_lots').select('id,lot_number,item_id'),
    admin.from('iqc_control_lots').select('id,lot_number,control_material_id'),
  ])
  fail(lotError)
  fail(ctrlError)
  const lots = (lotRows ?? []) as RecordRow[]
  const ctrls = (ctrlRows ?? []) as RecordRow[]

  const itemIds = [...new Set(lots.map((row) => asString(row.item_id)))]
  const materialIds = [...new Set(ctrls.map((row) => asString(row.control_material_id)))]
  const [{ data: itemRows }, { data: materialRows }] = await Promise.all([
    itemIds.length ? admin.from('bm_stock_items').select('id,item_code,name,is_active,bm_stock_categories(name)').in('id', itemIds) : Promise.resolve({ data: [] }),
    materialIds.length ? admin.from('iqc_control_materials').select('id,name,level').in('id', materialIds) : Promise.resolve({ data: [] }),
  ])
  const items = new Map(((itemRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const materials = new Map(((materialRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))

  const reagent = new Map<string, string>()
  for (const row of lots) {
    const item = items.get(asString(row.item_id))
    const code = item ? asString(item.item_code) : ''
    reagent.set(asString(row.id), `${code ? `${code} · ` : ''}LOT ${asString(row.lot_number)}`)
  }
  const control = new Map<string, string>()
  for (const row of ctrls) {
    const material = materials.get(asString(row.control_material_id))
    const name = material ? asString(material.name) : ''
    const level = material ? nullableString(material.level) : null
    control.set(asString(row.id), `${name}${level ? ` (${level})` : ''} · LOT ${asString(row.lot_number)}`)
  }
  return { reagent, control }
}

async function loadLotOptions(
  instrumentIdsByEquipment: Map<string, string[]>,
  instrumentIdsByAnalyte: Map<string, string[]>,
  controlSpecRows: RecordRow[],
): Promise<{ reagentLots: LotOption[]; controlLots: LotOption[] }> {
  const admin = getAdminClient()
  const [{ data: lotRows, error: lotError }, { data: ctrlRows, error: ctrlError }] = await Promise.all([
    admin.from('bm_stock_lots').select('id,lot_number,item_id,expiry_date').order('created_at', { ascending: false }),
    admin.from('iqc_control_lots').select('id,lot_number,control_material_id,expiry_date').eq('is_active', true).order('created_at', { ascending: false }),
  ])
  fail(lotError)
  fail(ctrlError)
  const lots = (lotRows ?? []) as RecordRow[]
  const ctrls = (ctrlRows ?? []) as RecordRow[]

  const itemIds = [...new Set(lots.map((row) => asString(row.item_id)))]
  const materialIds = [...new Set(ctrls.map((row) => asString(row.control_material_id)))]
  const [{ data: itemRows }, { data: materialRows }] = await Promise.all([
    itemIds.length
      ? admin
        .from('bm_stock_items')
        .select('id,item_code,name,is_active,bm_stock_categories!inner(name)')
        .in('id', itemIds)
        .eq('is_active', true)
        .eq('bm_stock_categories.name', 'Reagent')
      : Promise.resolve({ data: [] }),
    materialIds.length ? admin.from('iqc_control_materials').select('id,name,level').in('id', materialIds) : Promise.resolve({ data: [] }),
  ])
  const { data: stockItemEquipmentData, error: stockItemEquipmentError } = itemIds.length
    ? await admin.from('bm_stock_item_equipment_links').select('stock_item_id,equipment_id').in('stock_item_id', itemIds)
    : { data: [], error: null }
  fail(stockItemEquipmentError)
  const items = new Map(((itemRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const materials = new Map(((materialRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const instrumentIdsByStockItem = new Map<string, string[]>()
  for (const row of (stockItemEquipmentData ?? []) as RecordRow[]) {
    const stockItemId = asString(row.stock_item_id)
    const instrumentIds = instrumentIdsByEquipment.get(asString(row.equipment_id)) ?? []
    if (stockItemId && instrumentIds.length) instrumentIdsByStockItem.set(stockItemId, [...(instrumentIdsByStockItem.get(stockItemId) ?? []), ...instrumentIds])
  }
  const controlLotFilter = new Map<string, { instrumentIds: Set<string>; analyteIds: Set<string> }>()
  for (const row of controlSpecRows) {
    const controlLotId = asString(row.control_lot_id)
    const analyteId = asString(row.analyte_id)
    if (!controlLotId || !analyteId) continue
    const current = controlLotFilter.get(controlLotId) ?? { instrumentIds: new Set<string>(), analyteIds: new Set<string>() }
    current.analyteIds.add(analyteId)
    for (const instrumentId of instrumentIdsByAnalyte.get(analyteId) ?? []) current.instrumentIds.add(instrumentId)
    controlLotFilter.set(controlLotId, current)
  }

  const reagentLots: LotOption[] = lots.flatMap((row) => {
    const item = items.get(asString(row.item_id))
    if (!item || !Boolean(item.is_active) || !isReagentStockItem(item)) return []
    return [{
      id: asString(row.id),
      label: `${item ? `${asString(item.item_code)} · ` : ''}LOT ${asString(row.lot_number)}`,
      subLabel: item ? asString(item.name) : null,
      instrumentIds: [...new Set(instrumentIdsByStockItem.get(asString(row.item_id)) ?? [])],
      analyteIds: [],
    }]
  })
  const controlLots: LotOption[] = ctrls.map((row) => {
    const material = materials.get(asString(row.control_material_id))
    const level = material ? nullableString(material.level) : null
    const filter = controlLotFilter.get(asString(row.id))
    return {
      id: asString(row.id),
      label: `${material ? asString(material.name) : ''}${level ? ` (${level})` : ''} · LOT ${asString(row.lot_number)}`,
      subLabel: nullableString(row.expiry_date) ? `Exp ${asString(row.expiry_date)}` : null,
      instrumentIds: filter ? [...filter.instrumentIds] : [],
      analyteIds: filter ? [...filter.analyteIds] : [],
    }
  })
  return { reagentLots, controlLots }
}

export async function getLotVerifWorkspace(actor: BmActor): Promise<LotVerifWorkspace> {
  void actor
  const admin = getAdminClient()
  const [
    { data: verData, error: verError },
    { data: measData, error: measError },
    { data: parallelData, error: parallelError },
    { data: analyteData, error: analyteError },
    { data: statsData, error: statsError },
    { data: baselineData, error: baselineError },
    { data: instrumentData, error: instrumentError },
    { data: instrumentEquipmentLinkData, error: instrumentEquipmentLinkError },
    { data: equipmentData, error: equipmentError },
    { data: planData, error: planError },
    labels,
  ] = await Promise.all([
    admin.from('lotverif_verifications').select('*').order('created_at', { ascending: false }),
    admin.from('lotverif_measurements').select('*').order('created_at', { ascending: true }),
    admin.from('lotverif_parallel_rows').select('*').order('level_no', { ascending: true }),
    admin.from('iqc_analytes').select('id,code,name,data_type,scale,unit').eq('is_active', true).order('code'),
    admin.from('iqc_control_specs').select('control_lot_id,analyte_id,assigned_mean,assigned_sd,lab_mean,lab_sd,lab_locked_at,active_limit'),
    admin.from('iqc_baselines').select('control_lot_id,analyte_id,instrument_id,mean,sd,state').eq('state', 'approved'),
    admin.from('iqc_instruments').select('id,code,name,model,is_active').eq('is_active', true).order('code'),
    admin.from('bm_equipment_module_links').select('equipment_id,entity_id').eq('module', 'iqc').eq('entity_type', 'instrument'),
    admin.from('bm_equipment').select('id,code,name,model,status'),
    admin.from('iqc_control_plans').select('analyte_id,instrument_id,is_active').eq('is_active', true),
    loadLotLabels(),
  ])
  fail(verError)
  fail(measError)
  fail(parallelError)
  fail(analyteError)
  fail(statsError)
  fail(baselineError)
  fail(instrumentError)
  fail(instrumentEquipmentLinkError)
  fail(equipmentError)
  fail(planError)

  const verRows = (verData ?? []) as RecordRow[]
  const measRows = (measData ?? []) as RecordRow[]
  const parallelRows = (parallelData ?? []) as RecordRow[]
  const analyteRows = (analyteData ?? []) as RecordRow[]
  const instrumentRows = (instrumentData ?? []) as RecordRow[]
  const equipmentById = new Map(((equipmentData ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const activeInstrumentIds = new Set(instrumentRows.map((row) => asString(row.id)).filter(Boolean))
  const equipmentIdByInstrument = new Map<string, string>()
  const instrumentIdsByEquipment = new Map<string, string[]>()
  for (const row of (instrumentEquipmentLinkData ?? []) as RecordRow[]) {
    const instrumentId = asString(row.entity_id)
    const equipmentId = asString(row.equipment_id)
    if (!activeInstrumentIds.has(instrumentId) || !instrumentId || !equipmentId) continue
    equipmentIdByInstrument.set(instrumentId, equipmentId)
    instrumentIdsByEquipment.set(equipmentId, [...(instrumentIdsByEquipment.get(equipmentId) ?? []), instrumentId])
  }
  const instrumentRecords: LotVerifInstrument[] = instrumentRows.map((row) => {
    const equipment = equipmentById.get(equipmentIdByInstrument.get(asString(row.id)) ?? '')
    const usableEquipment = equipment && asString(equipment.status) !== 'decommissioned' ? equipment : undefined
    return {
      id: asString(row.id),
      code: usableEquipment ? asString(usableEquipment.code) : asString(row.code),
      name: usableEquipment ? asString(usableEquipment.name) : asString(row.name),
      model: usableEquipment ? nullableString(usableEquipment.model) : nullableString(row.model),
      equipmentId: usableEquipment ? equipmentIdByInstrument.get(asString(row.id)) ?? null : null,
    }
  })
  const instruments = instrumentRecords.filter((instrument) => Boolean(instrument.equipmentId))
  const linkedInstrumentIds = new Set(instruments.map((instrument) => instrument.id))
  const unlinkedEquipment: LotVerifUnlinkedEquipment[] = ((equipmentData ?? []) as RecordRow[])
    .filter((row) => asString(row.status) !== 'decommissioned' && ![...equipmentIdByInstrument.values()].includes(asString(row.id)))
    .map((row) => ({
      id: asString(row.id),
      code: asString(row.code),
      name: asString(row.name),
      model: nullableString(row.model),
    }))
  const instrumentIdsByAnalyte = new Map<string, string[]>()
  for (const row of (planData ?? []) as RecordRow[]) {
    const analyteId = asString(row.analyte_id)
    const instrumentId = asString(row.instrument_id)
    if (!linkedInstrumentIds.has(instrumentId) || !analyteId || !instrumentId) continue
    instrumentIdsByAnalyte.set(analyteId, [...(instrumentIdsByAnalyte.get(analyteId) ?? []), instrumentId])
  }
  const options = await loadLotOptions(instrumentIdsByEquipment, instrumentIdsByAnalyte, (statsData ?? []) as RecordRow[])
  const analyteById = new Map(analyteRows.map((row) => [asString(row.id), row]))
  const instrumentById = new Map(instrumentRecords.map((instrument) => [instrument.id, instrument]))
  const names = await getNameMap(
    verRows.flatMap((row) => [asString(row.performed_by), asString(row.reviewed_by), asString(row.released_by), asString(row.created_by)]),
  )

  const measByVer = new Map<string, LotVerifMeasurement[]>()
  for (const row of measRows) {
    const m = mapMeasurement(row)
    const list = measByVer.get(m.verificationId) ?? []
    list.push(m)
    measByVer.set(m.verificationId, list)
  }

  const parallelByVer = new Map<string, LotVerifParallelRow[]>()
  for (const row of parallelRows) {
    const mapped = mapParallelRow(row)
    const list = parallelByVer.get(mapped.verificationId) ?? []
    list.push(mapped)
    parallelByVer.set(mapped.verificationId, list)
  }

  function lotLabel(stockId: string | null, controlId: string | null): string | null {
    if (stockId) return labels.reagent.get(stockId) ?? null
    if (controlId) return labels.control.get(controlId) ?? null
    return null
  }

  const verifications: LotVerification[] = verRows.map((row) => {
    const newStockLotId = nullableString(row.new_stock_lot_id)
    const oldStockLotId = nullableString(row.old_stock_lot_id)
    const newControlLotId = nullableString(row.new_control_lot_id)
    const oldControlLotId = nullableString(row.old_control_lot_id)
    const parallelAnalyteId = nullableString(row.parallel_analyte_id)
    const parallelAnalyte = parallelAnalyteId ? analyteById.get(parallelAnalyteId) : undefined
    const parallelRowsForVerification = parallelByVer.get(asString(row.id)) ?? []
    const parallelScale = row.parallel_scale ? asScale(row.parallel_scale) : parallelAnalyte ? asScale(parallelAnalyte.scale) : null
    const parallelUnit = nullableString(row.parallel_unit) ?? (parallelAnalyte ? nullableString(parallelAnalyte.unit) : null)
    const parallelLimit = nullableNumber(row.parallel_limit)
    const parallelSummary = parallelScale && parallelRowsForVerification.length
      ? mapParallelSummary(calculateParallelComparison({
          scale: parallelScale,
          limit: parallelLimit,
          rows: parallelRowsForVerification.map((parallelRow): ParallelControlInput => ({
            level: parallelRow.level,
            controlMean: parallelRow.controlMean,
            controlSd: parallelRow.controlSd,
            oldRun1: parallelRow.oldRun1,
            oldRun2: parallelRow.oldRun2,
            newRun1: parallelRow.newRun1,
            newRun2: parallelRow.newRun2,
          })),
        }), parallelUnit)
      : null
    return {
      id: asString(row.id),
      instrumentId: nullableString(row.instrument_id),
      instrumentCode: row.instrument_id ? instrumentById.get(asString(row.instrument_id))?.code ?? null : null,
      instrumentName: row.instrument_id ? instrumentById.get(asString(row.instrument_id))?.name ?? null : null,
      subjectKind: asString(row.subject_kind) as LotVerifSubjectKind,
      title: nullableString(row.title),
      newStockLotId,
      oldStockLotId,
      newControlLotId,
      oldControlLotId,
      newLotLabel: lotLabel(newStockLotId, newControlLotId),
      oldLotLabel: lotLabel(oldStockLotId, oldControlLotId),
      method: asString(row.method) as LotVerifMethod,
      acceptanceCriteria: nullableString(row.acceptance_criteria),
      parallelAnalyteId,
      parallelAnalyteCode: parallelAnalyte ? nullableString(parallelAnalyte.code) : null,
      parallelAnalyteName: parallelAnalyte ? nullableString(parallelAnalyte.name) : null,
      parallelScale,
      parallelUnit,
      parallelLimit,
      status: asString(row.status) as LotVerifStatus,
      conclusion: nullableString(row.conclusion),
      performedByName: names.get(asString(row.performed_by)) ?? null,
      reviewedByName: row.reviewed_by ? names.get(asString(row.reviewed_by)) ?? null : null,
      reviewedAt: nullableString(row.reviewed_at),
      releasedByName: row.released_by ? names.get(asString(row.released_by)) ?? null : null,
      releasedAt: nullableString(row.released_at),
      createdByName: names.get(asString(row.created_by)) ?? null,
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
      measurements: measByVer.get(asString(row.id)) ?? [],
      parallelRows: parallelRowsForVerification,
      parallelSummary,
    }
  })

  const analytes: LotVerifAnalyte[] = analyteRows.map((row) => ({
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    dataType: asString(row.data_type) === 'qualitative' ? 'qualitative' : 'quantitative',
    scale: asScale(row.scale),
    unit: nullableString(row.unit),
    instrumentIds: [...new Set(instrumentIdsByAnalyte.get(asString(row.id)) ?? [])],
  }))

  // VL must use an approved, instrument-scoped QC baseline. Do not expose the
  // legacy Assigned/Lab fallback for VL to the verification picker, otherwise
  // the old narrow Assigned SD can silently re-enter the calculation.
  const parallelControlStats: LotVerifControlStat[] = ((statsData ?? []) as RecordRow[]).flatMap((row) => {
    if (isVlQuantitativeAnalyte(analyteById.get(asString(row.analyte_id)))) return []
    const stat = activeControlStat(row)
    return [{
      controlLotId: asString(row.control_lot_id),
      analyteId: asString(row.analyte_id),
      instrumentId: null,
      mean: stat.mean,
      sd: stat.sd,
      source: stat.source,
    }]
  })
  for (const row of (baselineData ?? []) as RecordRow[]) {
    parallelControlStats.push({
      controlLotId: asString(row.control_lot_id),
      analyteId: asString(row.analyte_id),
      instrumentId: nullableString(row.instrument_id),
      mean: nullableNumber(row.mean),
      sd: nullableNumber(row.sd),
      source: 'baseline',
    })
  }

  const openStatuses: LotVerifStatus[] = ['draft', 'in-progress', 'passed', 'failed']
  return {
    verifications,
    instruments,
    unlinkedEquipment,
    reagentLots: options.reagentLots,
    controlLots: options.controlLots,
    analytes,
    parallelControlStats,
    summary: {
      total: verifications.length,
      open: verifications.filter((v) => openStatuses.includes(v.status)).length,
      released: verifications.filter((v) => v.status === 'released').length,
      failedOrRejected: verifications.filter((v) => v.status === 'failed' || v.status === 'rejected').length,
    },
  }
}

interface CreateInput {
  instrumentId: string
  subjectKind: LotVerifSubjectKind
  title?: string | null
  method: LotVerifMethod
  acceptanceCriteria?: string | null
  parallelAnalyteId?: string | null
  parallelLimit?: number | null
  newStockLotId?: string | null
  oldStockLotId?: string | null
  newControlLotId?: string | null
  oldControlLotId?: string | null
}

interface InstrumentScope {
  instrumentId: string
  equipmentId: string | null
  analyteIds: Set<string>
}

async function loadInstrumentScope(instrumentId: string): Promise<InstrumentScope> {
  if (!instrumentId.trim()) throw new HttpError(400, 'ต้องเลือกเครื่องมือก่อนสร้าง Lot verification')
  const admin = getAdminClient()
  const [{ data: instrumentData, error: instrumentError }, { data: planData, error: planError }, { data: linkData, error: linkError }] = await Promise.all([
    admin.from('iqc_instruments').select('id,is_active').eq('id', instrumentId).maybeSingle(),
    admin.from('iqc_control_plans').select('analyte_id').eq('instrument_id', instrumentId).eq('is_active', true),
    admin.from('bm_equipment_module_links').select('equipment_id').eq('module', 'iqc').eq('entity_type', 'instrument').eq('entity_id', instrumentId).maybeSingle(),
  ])
  fail(instrumentError)
  fail(planError)
  fail(linkError)
  if (!instrumentData || !Boolean((instrumentData as RecordRow).is_active)) throw new HttpError(400, 'ไม่พบเครื่องมือที่ใช้งานอยู่')
  const equipmentId = nullableString((linkData as RecordRow | null)?.equipment_id)
  if (!equipmentId) throw new HttpError(400, 'เครื่องมือนี้ยังไม่ได้เชื่อมกับ Equipment')
  const { data: equipmentData, error: equipmentError } = await admin.from('bm_equipment').select('id,status').eq('id', equipmentId).maybeSingle()
  fail(equipmentError)
  if (!equipmentData) throw new HttpError(400, 'ไม่พบ Equipment ที่เชื่อมกับเครื่องมือ')
  if (asString((equipmentData as RecordRow).status) === 'decommissioned') throw new HttpError(400, 'Equipment นี้เลิกใช้งานแล้ว')
  return {
    instrumentId,
    equipmentId,
    analyteIds: new Set(((planData ?? []) as RecordRow[]).map((row) => asString(row.analyte_id)).filter(Boolean)),
  }
}

async function assertInstrumentScopedLots(input: {
  subjectKind: LotVerifSubjectKind
  newStockLotId?: string | null
  oldStockLotId?: string | null
  newControlLotId?: string | null
  oldControlLotId?: string | null
  analyteId?: string | null
}, scope: InstrumentScope) {
  const lotIds = input.subjectKind === 'reagent-lot'
    ? [input.newStockLotId, input.oldStockLotId].filter((value): value is string => Boolean(value))
    : [input.newControlLotId, input.oldControlLotId].filter((value): value is string => Boolean(value))
  const uniqueLotIds = [...new Set(lotIds)]
  if (!uniqueLotIds.length) return
  const admin = getAdminClient()
  if (input.subjectKind === 'reagent-lot') {
    if (!scope.equipmentId) throw new HttpError(409, 'เครื่องมือนี้ยังไม่ได้ผูกกับ Equipment จึงกรอง Reagent lot ไม่ได้')
    const { data: lotData, error: lotError } = await admin.from('bm_stock_lots').select('id,item_id').in('id', uniqueLotIds)
    fail(lotError)
    const lotRows = (lotData ?? []) as RecordRow[]
    if (lotRows.length !== uniqueLotIds.length) throw new HttpError(400, 'ไม่พบ Reagent lot ที่เลือก')
    const itemIds = [...new Set(lotRows.map((row) => asString(row.item_id)).filter(Boolean))]
    const { data: linkData, error: linkError } = await admin
      .from('bm_stock_item_equipment_links')
      .select('stock_item_id')
      .eq('equipment_id', scope.equipmentId)
      .in('stock_item_id', itemIds)
    fail(linkError)
    const allowedItemIds = new Set(((linkData ?? []) as RecordRow[]).map((row) => asString(row.stock_item_id)))
    if (lotRows.some((row) => !allowedItemIds.has(asString(row.item_id)))) throw new HttpError(409, 'Reagent lot ที่เลือกไม่ตรงกับเครื่องมือ')
    return
  }

  if (!scope.analyteIds.size) throw new HttpError(409, 'เครื่องมือนี้ยังไม่มี Analyte ใน Control plan')
  const { data: specData, error: specError } = await admin
    .from('iqc_control_specs')
    .select('control_lot_id,analyte_id')
    .in('control_lot_id', uniqueLotIds)
  fail(specError)
  const allowedLots = new Set(
    ((specData ?? []) as RecordRow[])
      .filter((row) => scope.analyteIds.has(asString(row.analyte_id)) && (!input.analyteId || asString(row.analyte_id) === input.analyteId))
      .map((row) => asString(row.control_lot_id)),
  )
  if (uniqueLotIds.some((lotId) => !allowedLots.has(lotId))) throw new HttpError(409, 'Control lot ที่เลือกไม่ตรงกับเครื่องมือหรือ Analyte')
}

async function loadParallelAnalyte(analyteId: string) {
  const { data, error } = await getAdminClient()
    .from('iqc_analytes')
    .select('id,code,name,data_type,scale,unit')
    .eq('id', analyteId)
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(400, 'ไม่พบ Analyte สำหรับ Parallel comparison')
  const row = data as RecordRow
  if (asString(row.data_type) !== 'quantitative') throw new HttpError(400, 'Parallel comparison รองรับเฉพาะ quantitative analyte')
  return row
}

async function assertReagentStockLots(lotIds: string[]) {
  const uniqueLotIds = [...new Set(lotIds.filter(Boolean))]
  if (!uniqueLotIds.length) return
  const admin = getAdminClient()
  const { data: lotData, error: lotError } = await admin.from('bm_stock_lots').select('id,item_id').in('id', uniqueLotIds)
  fail(lotError)
  const lotRows = (lotData ?? []) as RecordRow[]
  if (lotRows.length !== uniqueLotIds.length) throw new HttpError(400, 'ไม่พบ Reagent lot ที่เลือก')
  const itemIds = [...new Set(lotRows.map((row) => asString(row.item_id)).filter(Boolean))]
  const { data: itemData, error: itemError } = await admin
    .from('bm_stock_items')
    .select('id,is_active,bm_stock_categories(name)')
    .in('id', itemIds)
  fail(itemError)
  const itemsById = new Map(((itemData ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  if (lotRows.some((lot) => {
    const item = itemsById.get(asString(lot.item_id))
    return !item || !Boolean(item.is_active) || !isReagentStockItem(item)
  })) throw new HttpError(400, 'Lot-to-Lot สำหรับ Reagent เลือกได้เฉพาะ Stock item หมวด Reagent ที่ยังใช้งาน')
}

export async function createVerification(input: CreateInput, actor: BmActor): Promise<string> {
  const instrumentScope = await loadInstrumentScope(input.instrumentId)
  if (input.subjectKind === 'reagent-lot' && !input.newStockLotId) throw new HttpError(400, 'Select the new reagent lot')
  if (input.subjectKind === 'control-lot' && !input.newControlLotId) throw new HttpError(400, 'Select the new control lot')
  if (input.method === 'parallel-comparison') {
    if (!input.parallelAnalyteId) throw new HttpError(400, 'ต้องเลือก Analyte สำหรับ Parallel comparison')
    if (!instrumentScope.analyteIds.has(input.parallelAnalyteId)) throw new HttpError(409, 'Analyte นี้ยังไม่ได้ผูกกับเครื่องมือที่เลือก')
    if (input.subjectKind === 'reagent-lot' && !input.oldStockLotId) throw new HttpError(400, 'Parallel comparison ต้องเลือก lot เดิมเพื่อเทียบ')
    if (input.subjectKind === 'control-lot' && !input.oldControlLotId) throw new HttpError(400, 'Parallel comparison ต้องเลือก control lot เดิมเพื่อเทียบ')
  }
  if (input.subjectKind === 'reagent-lot') await assertReagentStockLots([input.newStockLotId ?? '', input.oldStockLotId ?? ''])
  await assertInstrumentScopedLots({
    subjectKind: input.subjectKind,
    newStockLotId: input.newStockLotId,
    oldStockLotId: input.oldStockLotId,
    newControlLotId: input.newControlLotId,
    oldControlLotId: input.oldControlLotId,
    analyteId: input.parallelAnalyteId,
  }, instrumentScope)
  const parallelAnalyte = input.method === 'parallel-comparison' ? await loadParallelAnalyte(input.parallelAnalyteId!) : null
  const parallelLimit = input.method === 'parallel-comparison' ? (input.parallelLimit ?? 1) : null
  if (parallelLimit != null && (!Number.isFinite(parallelLimit) || parallelLimit <= 0)) throw new HttpError(400, 'Parallel index limit ต้องมากกว่า 0')
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('lotverif_verifications')
    .insert({
      subject_kind: input.subjectKind,
      instrument_id: input.instrumentId,
      title: clean(input.title),
      method: input.method,
      acceptance_criteria: clean(input.acceptanceCriteria) ?? (parallelLimit != null ? `ABS(Index) ≤ ${parallelLimit}` : null),
      parallel_analyte_id: parallelAnalyte ? asString(parallelAnalyte.id) : null,
      parallel_scale: parallelAnalyte ? asScale(parallelAnalyte.scale) : null,
      parallel_unit: parallelAnalyte ? nullableString(parallelAnalyte.unit) : null,
      parallel_limit: parallelLimit,
      new_stock_lot_id: clean(input.newStockLotId),
      old_stock_lot_id: clean(input.oldStockLotId),
      new_control_lot_id: clean(input.newControlLotId),
      old_control_lot_id: clean(input.oldControlLotId),
      status: 'draft',
      performed_by: actor.id,
      created_by: actor.id,
    })
    .select('id')
    .single()
  if (error) throw new HttpError(400, error.message || 'Could not create verification')
  const id = asString((data as RecordRow).id)
  await writeAudit(actor, 'lotverif.create', 'lotverif', id, { subjectKind: input.subjectKind })
  return id
}

interface MeasurementInput {
  analyteId?: string | null
  analyteLabel?: string | null
  sampleLabel?: string | null
  oldValue?: number | null
  newValue?: number | null
  oldQualitative?: string | null
  newQualitative?: string | null
  acceptancePercent?: number | null
}

export async function addMeasurements(verificationId: string, rows: MeasurementInput[], actor: BmActor): Promise<void> {
  if (!rows.length) throw new HttpError(400, 'No measurements provided')
  const admin = getAdminClient()
  const { data: verRow, error: verError } = await admin.from('lotverif_verifications').select('id,status').eq('id', verificationId).maybeSingle()
  fail(verError)
  if (!verRow) throw new HttpError(404, 'Verification not found')

  const inserts = rows.map((row) => {
    const oldValue = row.oldValue ?? null
    const newValue = row.newValue ?? null
    let diff: number | null = null
    let pct: number | null = null
    let within: boolean | null = null
    if (oldValue != null && newValue != null) {
      diff = difference(oldValue, newValue)
      const computed = percentDiff(oldValue, newValue)
      pct = Number.isFinite(computed) ? computed : null
      if (row.acceptancePercent != null && pct != null) within = withinCriteria(pct, row.acceptancePercent)
    }
    const oldQual = clean(row.oldQualitative)
    const newQual = clean(row.newQualitative)
    const concordant = oldQual != null && newQual != null ? oldQual.toLowerCase() === newQual.toLowerCase() : null
    return {
      verification_id: verificationId,
      analyte_id: clean(row.analyteId),
      analyte_label: clean(row.analyteLabel),
      sample_label: clean(row.sampleLabel),
      old_value: oldValue,
      new_value: newValue,
      difference: diff,
      percent_diff: pct,
      within_criteria: within,
      old_qualitative: oldQual,
      new_qualitative: newQual,
      concordant,
    }
  })

  const { error } = await admin.from('lotverif_measurements').insert(inserts)
  if (error) throw new HttpError(400, error.message || 'Could not save measurements')

  if (asString((verRow as RecordRow).status) === 'draft') {
    await admin.from('lotverif_verifications').update({ status: 'in-progress', updated_at: new Date().toISOString() }).eq('id', verificationId)
  }
  await writeAudit(actor, 'lotverif.measurements.add', 'lotverif', verificationId, { count: inserts.length })
}

interface ParallelMeasurementInput {
  level: number
  controlLotId?: string | null
  controlLabel?: string | null
  controlMean?: number | null
  controlSd?: number | null
  oldRun1?: number | null
  oldRun2?: number | null
  newRun1?: number | null
  newRun2?: number | null
}

function hasParallelRun(row: ParallelMeasurementInput | LotVerifParallelRow) {
  return [row.oldRun1, row.oldRun2, row.newRun1, row.newRun2].some((value) => typeof value === 'number' && Number.isFinite(value))
}

function parallelInputFromRow(row: LotVerifParallelRow): ParallelControlInput {
  return {
    level: row.level,
    controlMean: row.controlMean,
    controlSd: row.controlSd,
    oldRun1: row.oldRun1,
    oldRun2: row.oldRun2,
    newRun1: row.newRun1,
    newRun2: row.newRun2,
  }
}

export async function saveParallelMeasurements(verificationId: string, rows: ParallelMeasurementInput[], actor: BmActor): Promise<void> {
  if (!rows.length || rows.length > 3) throw new HttpError(400, 'Parallel comparison ต้องมีข้อมูลไม่เกิน 3 control levels')
  const levels = rows.map((row) => row.level)
  if (levels.some((level) => !Number.isInteger(level) || level < 1 || level > 3) || new Set(levels).size !== levels.length) {
    throw new HttpError(400, 'Control level ต้องเป็น 1, 2, 3 และห้ามซ้ำกัน')
  }

  const admin = getAdminClient()
  const { data: verification, error: verificationError } = await admin
    .from('lotverif_verifications')
    .select('id,status,method,instrument_id,parallel_analyte_id,parallel_scale,parallel_limit')
    .eq('id', verificationId)
    .maybeSingle()
  fail(verificationError)
  if (!verification) throw new HttpError(404, 'Verification not found')
  const verificationRow = verification as RecordRow
  if (asString(verificationRow.method) !== 'parallel-comparison') throw new HttpError(400, 'รายการนี้ไม่ได้ใช้ Parallel comparison')
  const analyteId = nullableString(verificationRow.parallel_analyte_id)
  if (!analyteId) throw new HttpError(400, 'Parallel verification ยังไม่ได้กำหนด Analyte')
  const scale = asScale(verificationRow.parallel_scale)
  const limit = nullableNumber(verificationRow.parallel_limit) ?? 1
  const parallelAnalyte = await loadParallelAnalyte(analyteId)
  const vlQuantitative = isVlQuantitativeAnalyte(parallelAnalyte)

  const controlLotIds = [...new Set(rows.map((row) => clean(row.controlLotId)).filter((id): id is string => Boolean(id)))]
  const statsByLot = new Map<string, { mean: number | null; sd: number | null; source: 'assigned' | 'lab' | 'baseline' }>()
  if (controlLotIds.length) {
    const [{ data: lotRows, error: lotError }, { data: specRows, error: specError }, { data: baselineRows, error: baselineError }] = await Promise.all([
      admin.from('iqc_control_lots').select('id').in('id', controlLotIds),
      admin.from('iqc_control_specs').select('control_lot_id,analyte_id,assigned_mean,assigned_sd,lab_mean,lab_sd,lab_locked_at,active_limit').in('control_lot_id', controlLotIds).eq('analyte_id', analyteId),
      admin.from('iqc_baselines').select('control_lot_id,analyte_id,instrument_id,mean,sd,state').in('control_lot_id', controlLotIds).eq('analyte_id', analyteId).eq('instrument_id', nullableString(verificationRow.instrument_id) ?? '').eq('state', 'approved'),
    ])
    fail(lotError)
    fail(specError)
    fail(baselineError)
    if (((lotRows ?? []) as RecordRow[]).length !== controlLotIds.length) throw new HttpError(400, 'ไม่พบ Control lot ที่เลือก')
    if (!vlQuantitative) {
      for (const spec of (specRows ?? []) as RecordRow[]) statsByLot.set(asString(spec.control_lot_id), activeControlStat(spec))
    }
    for (const baseline of (baselineRows ?? []) as RecordRow[]) {
      statsByLot.set(asString(baseline.control_lot_id), {
        mean: nullableNumber(baseline.mean),
        sd: nullableNumber(baseline.sd),
        source: 'baseline',
      })
    }
  }

  const payloads = rows.map((row) => {
    const controlLotId = clean(row.controlLotId)
    const stat = controlLotId ? statsByLot.get(controlLotId) : undefined
    const manualMean = row.controlMean ?? null
    const manualSd = row.controlSd ?? null
    if (vlQuantitative && hasParallelRun(row) && (!controlLotId || !stat || stat.mean == null || stat.sd == null)) {
      throw new HttpError(409, 'Viral load ต้องเลือก Control lot ที่มี approved QC baseline ของเครื่องมือนี้ก่อนบันทึก Parallel comparison')
    }
    const controlMean = stat?.mean ?? (vlQuantitative ? null : manualMean)
    const controlSd = stat?.sd ?? (vlQuantitative ? null : manualSd)
    const statsSource = stat?.mean != null && stat?.sd != null ? stat.source : 'manual'
    if (hasParallelRun(row) && (controlMean == null || controlSd == null)) {
      throw new HttpError(400, `Control level ${row.level} ต้องมี Mean และ SD จาก IQC หรือกรอกแบบ manual`)
    }
    if (scale === 'log10' && [row.oldRun1, row.oldRun2, row.newRun1, row.newRun2].some((value) => value != null && value <= 0)) {
      throw new HttpError(400, 'Viral load แบบ log10 ต้องใช้ค่าผลตรวจที่มากกว่า 0')
    }
    return {
      verification_id: verificationId,
      level_no: row.level,
      control_lot_id: controlLotId,
      control_label: clean(row.controlLabel) ?? `Control level ${row.level}`,
      control_mean: controlMean,
      control_sd: controlSd,
      stats_source: statsSource,
      old_run_1: row.oldRun1 ?? null,
      old_run_2: row.oldRun2 ?? null,
      new_run_1: row.newRun1 ?? null,
      new_run_2: row.newRun2 ?? null,
    }
  })

  const { error: upsertError } = await admin.from('lotverif_parallel_rows').upsert(payloads, { onConflict: 'verification_id,level_no' })
  fail(upsertError)

  const { data: savedData, error: savedError } = await admin
    .from('lotverif_parallel_rows')
    .select('*')
    .eq('verification_id', verificationId)
    .order('level_no', { ascending: true })
  fail(savedError)
  const savedRows = ((savedData ?? []) as RecordRow[]).map(mapParallelRow)
  const calculation = calculateParallelComparison({ scale, limit, rows: savedRows.map(parallelInputFromRow) })
  for (const savedRow of savedRows) {
    const level = calculation.levels.find((item) => item.level === savedRow.level)
    const { error: derivedError } = await admin
      .from('lotverif_parallel_rows')
      .update({
        current_mean: level?.currentMean ?? null,
        new_mean: level?.newMean ?? null,
        difference: level?.difference ?? null,
        percent_diff: level?.percentDiff ?? null,
        cv_percent: level?.cvPercent ?? null,
      })
      .eq('id', savedRow.id)
    fail(derivedError)
  }

  if (asString(verificationRow.status) === 'draft') {
    const { error: statusError } = await admin.from('lotverif_verifications').update({ status: 'in-progress', updated_at: new Date().toISOString() }).eq('id', verificationId)
    fail(statusError)
  }
  await writeAudit(actor, 'lotverif.parallel.save', 'lotverif', verificationId, {
    levels: rows.map((row) => row.level),
    scale,
    calculationReason: calculation.reason,
    index: calculation.index,
  })
}

async function assertParallelCanPass(verificationId: string) {
  const admin = getAdminClient()
  const [{ data: verification, error: verificationError }, { data: rowData, error: rowError }] = await Promise.all([
    admin.from('lotverif_verifications').select('method,parallel_scale,parallel_limit').eq('id', verificationId).maybeSingle(),
    admin.from('lotverif_parallel_rows').select('*').eq('verification_id', verificationId).order('level_no', { ascending: true }),
  ])
  fail(verificationError)
  fail(rowError)
  if (!verification || asString((verification as RecordRow).method) !== 'parallel-comparison') return
  const scale = asScale((verification as RecordRow).parallel_scale)
  const limit = nullableNumber((verification as RecordRow).parallel_limit) ?? 1
  const rows = ((rowData ?? []) as RecordRow[]).map(mapParallelRow)
  const calculation = calculateParallelComparison({ scale, limit, rows: rows.map(parallelInputFromRow) })
  if (calculation.passed !== true) {
    const message = calculation.reason === 'insufficient-levels'
      ? 'Parallel comparison ต้องมีข้อมูลครบอย่างน้อย 2 Control levels'
      : calculation.reason === 'incomplete-level'
        ? 'Parallel comparison ยังมี Control level ที่กรอกผลเดิม/ผลใหม่ไม่ครบ'
        : calculation.reason === 'evaluated'
          ? `Parallel index ${calculation.index?.toFixed(3) ?? '—'} เกินเกณฑ์ ${limit}`
          : 'Parallel comparison ยังไม่สามารถคำนวณผลได้'
    throw new HttpError(409, message)
  }
}

async function assertCanRelease(verificationId: string) {
  const { data, error } = await getAdminClient()
    .from('lotverif_verifications')
    .select('status,method')
    .eq('id', verificationId)
    .maybeSingle()
  fail(error)
  if (!data) throw new HttpError(404, 'Verification not found')
  const row = data as RecordRow
  if (asString(row.status) !== 'passed') throw new HttpError(409, 'ต้องตรวจทานและบันทึกผลผ่านก่อนอนุมัติใช้')
  if (asString(row.method) === 'parallel-comparison') await assertParallelCanPass(verificationId)
}

interface UpdateInput {
  instrumentId?: string | null
  status?: LotVerifStatus
  conclusion?: string | null
  acceptanceCriteria?: string | null
  title?: string | null
  method?: LotVerifMethod
  parallelAnalyteId?: string | null
  parallelLimit?: number | null
}

export async function updateVerification(id: string, patch: UpdateInput, actor: BmActor): Promise<void> {
  const admin = getAdminClient()
  const update: RecordRow = { updated_at: new Date().toISOString() }
  if (patch.instrumentId !== undefined) update.instrument_id = patch.instrumentId
  if (patch.conclusion !== undefined) update.conclusion = clean(patch.conclusion)
  if (patch.acceptanceCriteria !== undefined) update.acceptance_criteria = clean(patch.acceptanceCriteria)
  if (patch.title !== undefined) update.title = clean(patch.title)
  if (patch.method !== undefined) update.method = patch.method

  const configPatch = patch.instrumentId !== undefined || patch.method !== undefined || patch.parallelAnalyteId !== undefined || patch.parallelLimit !== undefined
  if (configPatch) {
    const { data: existingData, error: existingError } = await admin
      .from('lotverif_verifications')
      .select('method,parallel_analyte_id,parallel_limit,acceptance_criteria,instrument_id,subject_kind,new_stock_lot_id,old_stock_lot_id,new_control_lot_id,old_control_lot_id')
      .eq('id', id)
      .maybeSingle()
    fail(existingError)
    if (!existingData) throw new HttpError(404, 'Verification not found')
    const existing = existingData as RecordRow
    const nextMethod = (patch.method ?? asString(existing.method)) as LotVerifMethod
    const nextInstrumentId = patch.instrumentId !== undefined ? patch.instrumentId : nullableString(existing.instrument_id)
    if (!nextInstrumentId) throw new HttpError(400, 'ต้องเลือกเครื่องมือก่อนบันทึกการแก้ไข')
    const instrumentScope = await loadInstrumentScope(nextInstrumentId)
    if (nextMethod === 'parallel-comparison') {
      const analyteId = patch.parallelAnalyteId !== undefined ? patch.parallelAnalyteId : nullableString(existing.parallel_analyte_id)
      if (!analyteId) throw new HttpError(400, 'ต้องเลือก Analyte สำหรับ Parallel comparison')
      if (!instrumentScope.analyteIds.has(analyteId)) throw new HttpError(409, 'Analyte นี้ยังไม่ได้ผูกกับเครื่องมือที่เลือก')
      const analyte = await loadParallelAnalyte(analyteId)
      const limit = patch.parallelLimit !== undefined ? patch.parallelLimit : nullableNumber(existing.parallel_limit) ?? 1
      if (limit == null || !Number.isFinite(limit) || limit <= 0) throw new HttpError(400, 'Parallel index limit ต้องมากกว่า 0')
      update.parallel_analyte_id = asString(analyte.id)
      update.parallel_scale = asScale(analyte.scale)
      update.parallel_unit = nullableString(analyte.unit)
      update.parallel_limit = limit
      if (patch.acceptanceCriteria === undefined && !clean(nullableString(existing.acceptance_criteria))) {
        update.acceptance_criteria = `ABS(Index) ≤ ${limit}`
      }
    } else if (patch.method !== undefined) {
      update.parallel_analyte_id = null
      update.parallel_scale = null
      update.parallel_unit = null
      update.parallel_limit = null
    }
    await assertInstrumentScopedLots({
      subjectKind: asString(existing.subject_kind) as LotVerifSubjectKind,
      newStockLotId: nullableString(existing.new_stock_lot_id),
      oldStockLotId: nullableString(existing.old_stock_lot_id),
      newControlLotId: nullableString(existing.new_control_lot_id),
      oldControlLotId: nullableString(existing.old_control_lot_id),
      analyteId: nextMethod === 'parallel-comparison'
        ? patch.parallelAnalyteId !== undefined ? patch.parallelAnalyteId : nullableString(existing.parallel_analyte_id)
        : null,
    }, instrumentScope)
    update.instrument_id = nextInstrumentId
  }

  if (patch.status !== undefined) {
    if (patch.status === 'passed') await assertParallelCanPass(id)
    if (patch.status === 'released') await assertCanRelease(id)
    update.status = patch.status
    if (patch.status === 'released' || patch.status === 'rejected') {
      assertAdmin(actor)
      update.released_by = actor.id
      update.released_at = new Date().toISOString()
    }
    if (patch.status === 'passed' || patch.status === 'failed') {
      update.reviewed_by = actor.id
      update.reviewed_at = new Date().toISOString()
    }
  }

  const { error } = await admin.from('lotverif_verifications').update(update).eq('id', id)
  fail(error)
  await writeAudit(actor, 'lotverif.update', 'lotverif', id, { patch })
}

export async function deleteVerification(id: string, actor: BmActor): Promise<void> {
  assertAdmin(actor)
  const admin = getAdminClient()
  const { data: verification, error: verificationError } = await admin
    .from('lotverif_verifications')
    .select('id,status,title')
    .eq('id', id)
    .maybeSingle()
  fail(verificationError)
  if (!verification) throw new HttpError(404, 'Verification not found')
  const status = asString((verification as RecordRow).status) as LotVerifStatus

  const { count, error: attachmentError } = await admin
    .from('bm_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'lotverif')
    .eq('entity_type', 'verification')
    .eq('entity_id', id)
  fail(attachmentError)
  if ((count ?? 0) > 0) throw new HttpError(409, 'ลบไฟล์แนบออกก่อนจึงจะลบ verification ได้')

  const { error } = await admin.from('lotverif_verifications').delete().eq('id', id)
  fail(error)
  await writeAudit(actor, 'lotverif.delete', 'lotverif', id, {
    status,
    title: nullableString((verification as RecordRow).title),
  })
}
