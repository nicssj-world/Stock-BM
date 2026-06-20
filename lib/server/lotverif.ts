import 'server-only'

import type {
  LotOption,
  LotVerifAnalyte,
  LotVerifMeasurement,
  LotVerifMethod,
  LotVerifStatus,
  LotVerifSubjectKind,
  LotVerification,
  LotVerifWorkspace,
} from '@/lib/lotverif/types'
import { difference, percentDiff, withinCriteria } from '@/lib/lotverif/compare'
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
    itemIds.length ? admin.from('bm_stock_items').select('id,item_code,name').in('id', itemIds) : Promise.resolve({ data: [] }),
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

async function loadLotOptions(): Promise<{ reagentLots: LotOption[]; controlLots: LotOption[] }> {
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
    itemIds.length ? admin.from('bm_stock_items').select('id,item_code,name').in('id', itemIds) : Promise.resolve({ data: [] }),
    materialIds.length ? admin.from('iqc_control_materials').select('id,name,level').in('id', materialIds) : Promise.resolve({ data: [] }),
  ])
  const items = new Map(((itemRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const materials = new Map(((materialRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))

  const reagentLots: LotOption[] = lots.map((row) => {
    const item = items.get(asString(row.item_id))
    return {
      id: asString(row.id),
      label: `${item ? `${asString(item.item_code)} · ` : ''}LOT ${asString(row.lot_number)}`,
      subLabel: item ? asString(item.name) : null,
    }
  })
  const controlLots: LotOption[] = ctrls.map((row) => {
    const material = materials.get(asString(row.control_material_id))
    const level = material ? nullableString(material.level) : null
    return {
      id: asString(row.id),
      label: `${material ? asString(material.name) : ''}${level ? ` (${level})` : ''} · LOT ${asString(row.lot_number)}`,
      subLabel: nullableString(row.expiry_date) ? `Exp ${asString(row.expiry_date)}` : null,
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
    { data: analyteData, error: analyteError },
    labels,
    options,
  ] = await Promise.all([
    admin.from('lotverif_verifications').select('*').order('created_at', { ascending: false }),
    admin.from('lotverif_measurements').select('*').order('created_at', { ascending: true }),
    admin.from('iqc_analytes').select('id,code,name').eq('is_active', true).order('code'),
    loadLotLabels(),
    loadLotOptions(),
  ])
  fail(verError)
  fail(measError)
  fail(analyteError)

  const verRows = (verData ?? []) as RecordRow[]
  const measRows = (measData ?? []) as RecordRow[]
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
    return {
      id: asString(row.id),
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
    }
  })

  const analytes: LotVerifAnalyte[] = ((analyteData ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
  }))

  const openStatuses: LotVerifStatus[] = ['draft', 'in-progress', 'passed', 'failed']
  return {
    verifications,
    reagentLots: options.reagentLots,
    controlLots: options.controlLots,
    analytes,
    summary: {
      total: verifications.length,
      open: verifications.filter((v) => openStatuses.includes(v.status)).length,
      released: verifications.filter((v) => v.status === 'released').length,
      failedOrRejected: verifications.filter((v) => v.status === 'failed' || v.status === 'rejected').length,
    },
  }
}

interface CreateInput {
  subjectKind: LotVerifSubjectKind
  title?: string | null
  method: LotVerifMethod
  acceptanceCriteria?: string | null
  newStockLotId?: string | null
  oldStockLotId?: string | null
  newControlLotId?: string | null
  oldControlLotId?: string | null
}

export async function createVerification(input: CreateInput, actor: BmActor): Promise<string> {
  if (input.subjectKind === 'reagent-lot' && !input.newStockLotId) throw new HttpError(400, 'Select the new reagent lot')
  if (input.subjectKind === 'control-lot' && !input.newControlLotId) throw new HttpError(400, 'Select the new control lot')
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('lotverif_verifications')
    .insert({
      subject_kind: input.subjectKind,
      title: clean(input.title),
      method: input.method,
      acceptance_criteria: clean(input.acceptanceCriteria),
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

interface UpdateInput {
  status?: LotVerifStatus
  conclusion?: string | null
  acceptanceCriteria?: string | null
  title?: string | null
}

export async function updateVerification(id: string, patch: UpdateInput, actor: BmActor): Promise<void> {
  const admin = getAdminClient()
  const update: RecordRow = { updated_at: new Date().toISOString() }
  if (patch.conclusion !== undefined) update.conclusion = clean(patch.conclusion)
  if (patch.acceptanceCriteria !== undefined) update.acceptance_criteria = clean(patch.acceptanceCriteria)
  if (patch.title !== undefined) update.title = clean(patch.title)

  if (patch.status !== undefined) {
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
