import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { addKeyValueSheet, addTableSheet, excelDate, newWorkbook } from '@/lib/server/xlsx-export'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

const PAGE = 1000
const ID_CHUNK = 150
const MAX_RUNS = 20000

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const nullableString = (value: unknown) => (typeof value === 'string' && value ? value : null)
const nullableNumber = (value: unknown) => (value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null)
const asStringArray = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

function fail(error: { message: string } | null) {
  if (error) throw new HttpError(400, error.message || 'IQC export query failed')
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

/** Bangkok-local YYYY-MM-DD bounds → [from 00:00, to+1 00:00) in UTC ISO. */
function bangkokRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`)
  const end = new Date(`${to}T00:00:00+07:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new HttpError(400, 'ช่วงวันที่ไม่ถูกต้อง')
  if (end < start) throw new HttpError(400, 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม')
  end.setUTCDate(end.getUTCDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

async function selectByIds(table: string, column: string, ids: string[], columns = '*') {
  const admin = getAdminClient()
  const rows: RecordRow[] = []
  for (const part of chunks([...new Set(ids)].filter(Boolean), ID_CHUNK)) {
    // A chunk of runs can hold more than one page of results, so page within it too.
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from(table).select(columns).in(column, part).range(offset, offset + PAGE - 1)
      fail(error)
      rows.push(...((data ?? []) as unknown as RecordRow[]))
      if (!data || data.length < PAGE) break
    }
  }
  return rows
}

export interface IqcExportRange {
  from: string
  to: string
}

export interface IqcRangeData {
  runs: RecordRow[]
  results: RecordRow[]
  consumables: RecordRow[]
  actions: RecordRow[]
  analytes: Map<string, RecordRow>
  lots: Map<string, RecordRow>
  materials: Map<string, RecordRow>
  instruments: Map<string, RecordRow>
  runById: Map<string, RecordRow>
  users: Map<string, string>
}

/**
 * Loads every IQC run in a Bangkok date range with all its results, consumables and
 * corrective actions, paging past PostgREST's max-rows cap so nothing is silently dropped.
 */
export async function loadIqcRangeData(range: IqcExportRange, actor: BmActor): Promise<IqcRangeData> {
  if (actor.role === 'Assistant') throw new HttpError(403, 'IQC permission required')
  const admin = getAdminClient()
  const { startIso, endIso } = bangkokRange(range.from, range.to)

  const runs: RecordRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('iqc_runs')
      .select('*')
      .gte('run_datetime', startIso)
      .lt('run_datetime', endIso)
      .order('run_datetime')
      .order('id')
      .range(offset, offset + PAGE - 1)
    fail(error)
    runs.push(...((data ?? []) as RecordRow[]))
    if (!data || data.length < PAGE) break
    if (runs.length >= MAX_RUNS) throw new HttpError(400, `ช่วงวันที่นี้มีมากกว่า ${MAX_RUNS} runs กรุณาเลือกช่วงให้สั้นลง`)
  }
  const runIds = runs.map((run) => asString(run.id))

  const [results, consumables, actions, { data: analyteRows, error: analyteError }, { data: lotRows, error: lotError }, { data: materialRows, error: materialError }, { data: instrumentRows, error: instrumentError }] = await Promise.all([
    selectByIds('iqc_result_values', 'run_id', runIds),
    selectByIds('iqc_run_consumables', 'run_id', runIds),
    selectByIds('iqc_corrective_actions', 'run_id', runIds),
    admin.from('iqc_analytes').select('id,code,name,unit,scale,data_type'),
    admin.from('iqc_control_lots').select('id,control_material_id,lot_number,expiry_date'),
    admin.from('iqc_control_materials').select('id,name,level'),
    admin.from('iqc_instruments').select('id,code,name'),
  ])
  fail(analyteError)
  fail(lotError)
  fail(materialError)
  fail(instrumentError)

  const analytes = new Map(((analyteRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const materials = new Map(((materialRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const lots = new Map(((lotRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const instruments = new Map(((instrumentRows ?? []) as RecordRow[]).map((row) => [asString(row.id), row]))
  const runById = new Map(runs.map((run) => [asString(run.id), run]))

  const userIds = [
    ...runs.map((run) => asString(run.entered_by)),
    ...actions.flatMap((row) => [asString(row.created_by), asString(row.closed_by), asString(row.owner_id)]),
  ].filter(Boolean)
  const users = new Map((await selectByIds('nipt_users', 'id', userIds, 'id,display_name')).map((row) => [asString(row.id), asString(row.display_name)]))

  results.sort((a, b) => asString(runById.get(asString(a.run_id))?.run_datetime).localeCompare(asString(runById.get(asString(b.run_id))?.run_datetime))
    || asString(analytes.get(asString(a.analyte_id))?.code).localeCompare(asString(analytes.get(asString(b.analyte_id))?.code)))
  consumables.sort((a, b) => asString(runById.get(asString(a.run_id))?.run_datetime).localeCompare(asString(runById.get(asString(b.run_id))?.run_datetime)))
  actions.sort((a, b) => asString(a.created_at).localeCompare(asString(b.created_at)))

  return { runs, results, consumables, actions, analytes, lots, materials, instruments, runById, users }
}

/** All IQC runs in a Bangkok date range with every result, consumable lot and corrective action. */
export async function buildIqcExportWorkbook(range: IqcExportRange, actor: BmActor) {
  const { runs, results, consumables, actions, analytes, lots, materials, instruments, runById, users } = await loadIqcRangeData(range, actor)

  const instrumentLabel = (id: unknown) => {
    const row = instruments.get(asString(id))
    return row ? [asString(row.code), asString(row.name)].filter(Boolean).join(' · ') : null
  }
  const runDate = (runId: unknown) => excelDate(nullableString(runById.get(asString(runId))?.run_datetime))
  const runInstrument = (runId: unknown) => instrumentLabel(runById.get(asString(runId))?.instrument_id)
  const runNo = (runId: unknown) => nullableNumber(runById.get(asString(runId))?.run_no)
  const lotOf = (id: unknown) => lots.get(asString(id))
  const materialOf = (lotId: unknown) => materials.get(asString(lotOf(lotId)?.control_material_id))

  const book = newWorkbook()
  addKeyValueSheet(book, 'About', [
    ['รายงาน', 'IQC raw data export'],
    ['ช่วงวันที่ (เวลาไทย)', `${range.from} ถึง ${range.to}`],
    ['Runs', runs.length],
    ['Results', results.length],
    ['Corrective actions', actions.length],
    ['ส่งออกโดย', actor.displayName ?? null],
    ['ส่งออกเมื่อ', excelDate(new Date().toISOString())],
    ['หมายเหตุ', 'ค่า Stat value คือค่าที่ใช้คำนวณ (log10 สำหรับ viral load); Z-score และสถานะเป็นค่าที่บันทึกไว้ ณ ตอนประเมิน'],
  ])

  addTableSheet<RecordRow>(book, 'Results', [
    { header: 'วันเวลา run', width: 18, numFmt: 'yyyy-mm-dd hh:mm', value: (row) => runDate(row.run_id) },
    { header: 'Run no.', width: 8, value: (row) => runNo(row.run_id) },
    { header: 'เครื่อง', width: 22, value: (row) => runInstrument(row.run_id) },
    { header: 'Control material', width: 22, value: (row) => nullableString(materialOf(row.control_lot_id)?.name) },
    { header: 'Level', width: 8, value: (row) => nullableString(materialOf(row.control_lot_id)?.level) },
    { header: 'Control lot', width: 14, value: (row) => nullableString(lotOf(row.control_lot_id)?.lot_number) },
    { header: 'Lot EXP', numFmt: 'yyyy-mm-dd', value: (row) => excelDate(nullableString(lotOf(row.control_lot_id)?.expiry_date)) },
    { header: 'Analyte', width: 12, value: (row) => nullableString(analytes.get(asString(row.analyte_id))?.code) },
    { header: 'Analyte name', width: 20, value: (row) => nullableString(analytes.get(asString(row.analyte_id))?.name) },
    { header: 'หน่วย', value: (row) => nullableString(analytes.get(asString(row.analyte_id))?.unit) },
    { header: 'ค่าที่รายงาน', numFmt: '0.####', value: (row) => nullableNumber(row.numeric_value) },
    { header: 'Stat value', numFmt: '0.0000', value: (row) => nullableNumber(row.stat_value) },
    { header: 'ผลเชิงคุณภาพ', value: (row) => nullableString(row.qualitative_value) },
    { header: 'Z-score', numFmt: '0.00', value: (row) => nullableNumber(row.z_score) },
    { header: 'สถานะ', value: (row) => nullableString(row.status) },
    { header: 'Westgard rules', width: 18, value: (row) => asStringArray(row.violated_rules).join(', ') || null },
    { header: 'Voided', value: (row) => (row.is_voided ? 'ใช่' : null) },
    { header: 'เหตุผล void', width: 24, value: (row) => nullableString(row.void_reason) },
    { header: 'ผู้บันทึก', width: 18, value: (row) => users.get(asString(runById.get(asString(row.run_id))?.entered_by)) ?? null },
    { header: 'หมายเหตุ run', width: 24, value: (row) => nullableString(runById.get(asString(row.run_id))?.note) },
  ], results)

  addTableSheet<RecordRow>(book, 'Consumables', [
    { header: 'วันเวลา run', width: 18, numFmt: 'yyyy-mm-dd hh:mm', value: (row) => runDate(row.run_id) },
    { header: 'เครื่อง', width: 22, value: (row) => runInstrument(row.run_id) },
    { header: 'ประเภท', width: 16, value: (row) => nullableString(row.kind) },
    { header: 'Lot', width: 16, value: (row) => nullableString(row.lot_number) },
    { header: 'ใช้กับ', value: (row) => nullableString(row.applies_scope) },
    { header: 'Beads/tube', value: (row) => nullableNumber(row.bead_count_per_tube) },
  ], consumables)

  addTableSheet<RecordRow>(book, 'Corrective actions', [
    { header: 'วันเวลา run', width: 18, numFmt: 'yyyy-mm-dd hh:mm', value: (row) => runDate(row.run_id) },
    { header: 'เครื่อง', width: 22, value: (row) => runInstrument(row.run_id) },
    { header: 'Analyte', value: (row) => nullableString(analytes.get(asString(row.analyte_id))?.code) },
    { header: 'ปัญหา', width: 36, value: (row) => nullableString(row.problem) },
    { header: 'ประเภทปัญหา', width: 18, value: (row) => asStringArray(row.issue_types).join(', ') || null },
    { header: 'Error type', value: (row) => nullableString(row.probable_error_type) },
    { header: 'Root cause', width: 30, value: (row) => nullableString(row.root_cause) },
    { header: 'การแก้ไข', width: 30, value: (row) => nullableString(row.action_taken) },
    { header: 'การป้องกัน', width: 30, value: (row) => nullableString(row.preventive_action) },
    { header: 'ผลการแก้ไข', value: (row) => nullableString(row.correction_outcome) },
    { header: 'สถานะ', value: (row) => nullableString(row.status) },
    { header: 'ผู้รับผิดชอบ', width: 18, value: (row) => users.get(asString(row.owner_id)) ?? null },
    { header: 'กำหนดเสร็จ', numFmt: 'yyyy-mm-dd', value: (row) => excelDate(nullableString(row.due_date)) },
    { header: 'Effectiveness', value: (row) => nullableString(row.effectiveness_outcome) },
    { header: 'สร้างโดย', width: 18, value: (row) => users.get(asString(row.created_by)) ?? null },
    { header: 'สร้างเมื่อ', numFmt: 'yyyy-mm-dd hh:mm', value: (row) => excelDate(nullableString(row.created_at)) },
    { header: 'ปิดโดย', width: 18, value: (row) => users.get(asString(row.closed_by)) ?? null },
    { header: 'ปิดเมื่อ', numFmt: 'yyyy-mm-dd hh:mm', value: (row) => excelDate(nullableString(row.closed_at)) },
  ], actions)

  return book
}
