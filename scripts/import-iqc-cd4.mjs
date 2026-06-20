// Seed the CD4 IQC dataset from the Google Sheet (BD FACSlyric, BD Multi-Check).
// Two control lots (sheet tabs): BM0426L (May-Jun) and BM0526L (Jun onward).
// The "Lot.No." column (25290) is the BD Trucount tube lot (a consumable that
// affects absolute counts), NOT the control lot — recorded per run.
// Usage: npm run seed:iqc-cd4 -- --ephis 9495 [--force]
import { createClient } from '@supabase/supabase-js'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}
function required(value, message) {
  if (!value) throw new Error(message)
  return value
}

const envHint = 'Configure .env.local before running this command.'
const url = required(process.env.NEXT_PUBLIC_BM_SUPABASE_URL, `Missing NEXT_PUBLIC_BM_SUPABASE_URL. ${envHint}`)
const serviceRoleKey = required(process.env.BM_SUPABASE_SERVICE_ROLE_KEY, `Missing BM_SUPABASE_SERVICE_ROLE_KEY. ${envHint}`)
const ephisId = required(argument('ephis'), 'Use --ephis <employee-code> (an existing Molecular-CBH QMS user)')
const force = process.argv.includes('--force')

// ---- Westgard (mirrors lib/iqc/westgard.ts), evaluated against assigned mean/SD ----
const REJECT = new Set(['1-3s', '2-2s', 'R-4s', '4-1s', '10x'])
function evaluateLatest(series, m, s) {
  if (!(s > 0)) return { z: 0, violatedRules: [], status: 'accepted' }
  const zs = series.map((v) => (v - m) / s)
  const i = zs.length - 1
  const z = zs[i]
  const rules = []
  if (Math.abs(z) > 3) rules.push('1-3s')
  if (i >= 1) {
    const zp = zs[i - 1]
    if ((z > 2 && zp > 2) || (z < -2 && zp < -2)) rules.push('2-2s')
    if (Math.abs(z - zp) > 4) rules.push('R-4s')
  }
  if (i >= 3) {
    const w = zs.slice(i - 3)
    if (w.every((x) => x > 1) || w.every((x) => x < -1)) rules.push('4-1s')
  }
  if (i >= 9) {
    const w = zs.slice(i - 9)
    if (w.every((x) => x > 0) || w.every((x) => x < 0)) rules.push('10x')
  }
  if (Math.abs(z) > 2 && !rules.includes('1-3s')) rules.push('1-2s')
  const status = rules.some((r) => REJECT.has(r)) ? 'rejected' : rules.includes('1-2s') ? 'warning' : 'accepted'
  return { z, violatedRules: rules, status }
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
function isoDate(ddMonYy) {
  const [d, mon, yy] = ddMonYy.split('-')
  return new Date(`${2000 + Number(yy)}-${String(MONTHS[mon] + 1).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}T08:00:00+07:00`).toISOString()
}

// ---- reference data ----
const TRUCOUNT_LOT = '25290'
const ANALYTES = [
  { code: '%CD3', name: '%CD3', is_absolute: false, unit: '%' },
  { code: 'AbsCD3', name: 'Absolute CD3', is_absolute: true, unit: 'cells/uL' },
  { code: '%CD4', name: '%CD4', is_absolute: false, unit: '%' },
  { code: 'AbsCD4', name: 'Absolute CD4', is_absolute: true, unit: 'cells/uL' },
]
const ORDER = ['%CD3', 'AbsCD3', '%CD4', 'AbsCD4'] // column order in rows below
const LOTS = [
  {
    lot: 'BM0426L',
    expiry: '2026-06-16',
    assigned: { '%CD3': [57.5, 5.0], AbsCD3: [792.9, 87.25], '%CD4': [11.5, 2.0], AbsCD4: [158.6, 31.7] },
    rows: [
      ['18-May-26', 57.79, 857, 11.4, 169], ['19-May-26', 55.78, 868, 11.64, 181], ['20-May-26', 58.26, 867, 12.2, 182],
      ['21-May-26', 59.43, 727, 12.19, 149], ['22-May-26', 54.64, 858, 11.12, 175], ['26-May-26', 56.12, 842, 11.41, 171],
      ['27-May-26', 56.74, 894, 11.84, 187], ['28-May-26', 55.86, 812, 11.29, 164], ['29-May-26', 59.31, 763, 12.01, 155],
      ['2-Jun-26', 55.38, 833, 11.28, 170], ['3-Jun-26', 55.92, 743, 11.24, 149], ['4-Jun-26', 57.11, 851, 11.5, 171],
      ['5-Jun-26', 55.47, 795, 11.9, 171], ['8-Jun-26', 55.58, 890, 10.76, 172], ['9-Jun-26', 57.44, 775, 11.4, 154],
      ['10-Jun-26', 55.02, 814, 11.2, 166], ['12-Jun-26', 57.78, 823, 12.08, 172], ['15-Jun-26', 54.64, 814, 11.29, 168],
      ['16-Jun-26', 55.34, 756, 11.64, 159],
    ],
  },
  {
    lot: 'BM0526L',
    expiry: '2026-07-17',
    assigned: { '%CD3': [56.3, 5.0], AbsCD3: [701.5, 91.2], '%CD4': [10.0, 2.0], AbsCD4: [124.6, 24.9] },
    rows: [
      ['17-Jun-26', 52.89, 812, 10.8, 166], ['18-Jun-26', 58.35, 793, 11, 149],
    ],
  },
]

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: user, error: userError } = await admin.from('nipt_users').select('id').eq('ephis_id', ephisId).maybeSingle()
if (userError) throw userError
const actorId = required(user?.id, `No nipt_users with ephis_id ${ephisId}`)

async function ensureAnalyte(a) {
  const { data: existing } = await admin.from('iqc_analytes').select('id').eq('code', a.code).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await admin.from('iqc_analytes').insert({
    code: a.code, name: a.name, data_type: 'quantitative', scale: 'linear', is_absolute: a.is_absolute, unit: a.unit, group_label: 'CD4 Panel', created_by: actorId,
  }).select('id').single()
  if (error) throw error
  return data.id
}
const analyteId = {}
for (const a of ANALYTES) analyteId[a.code] = await ensureAnalyte(a)

let { data: material } = await admin.from('iqc_control_materials').select('id').eq('name', 'BD Multi-Check CD3/CD4').maybeSingle()
if (!material) {
  const { data, error } = await admin.from('iqc_control_materials').insert({ name: 'BD Multi-Check CD3/CD4', level: 'Normal', manufacturer: 'BD', created_by: actorId }).select('id').single()
  if (error) throw error
  material = data
}

let { data: instrument } = await admin.from('iqc_instruments').select('id').eq('code', 'FACSLYRIC').maybeSingle()
if (!instrument) {
  const { data } = await admin.from('iqc_instruments').insert({ code: 'FACSLYRIC', name: 'BD FACSlyric', model: 'FACSLyric', created_by: actorId }).select('id').single()
  instrument = data
}

// ---- cleanup: remove the lot "25290" mistakenly seeded as a control lot ----
const { data: wrongLot } = await admin.from('iqc_control_lots').select('id').eq('control_material_id', material.id).eq('lot_number', TRUCOUNT_LOT).maybeSingle()
if (wrongLot) {
  const { data: wrongResults } = await admin.from('iqc_result_values').select('run_id').eq('control_lot_id', wrongLot.id)
  const runIds = [...new Set((wrongResults ?? []).map((r) => r.run_id))]
  if (runIds.length) await admin.from('iqc_runs').delete().in('id', runIds) // cascades result_values + consumables
  await admin.from('iqc_control_specs').delete().eq('control_lot_id', wrongLot.id)
  await admin.from('iqc_control_lots').delete().eq('id', wrongLot.id)
  console.log(`Cleaned up mis-seeded control lot "${TRUCOUNT_LOT}" (${runIds.length} runs).`)
}

let totalImported = 0
for (const cfg of LOTS) {
  let { data: lot } = await admin.from('iqc_control_lots').select('id').eq('control_material_id', material.id).eq('lot_number', cfg.lot).maybeSingle()
  if (!lot) {
    const { data, error } = await admin.from('iqc_control_lots').insert({ control_material_id: material.id, lot_number: cfg.lot, expiry_date: cfg.expiry, created_by: actorId }).select('id').single()
    if (error) throw error
    lot = data
  } else if (cfg.expiry) {
    await admin.from('iqc_control_lots').update({ expiry_date: cfg.expiry }).eq('id', lot.id)
  }

  for (const code of ORDER) {
    const [m, s] = cfg.assigned[code]
    const { data: spec } = await admin.from('iqc_control_specs').select('id').eq('control_lot_id', lot.id).eq('analyte_id', analyteId[code]).maybeSingle()
    if (spec) await admin.from('iqc_control_specs').update({ assigned_mean: m, assigned_sd: s, updated_at: new Date().toISOString() }).eq('id', spec.id)
    else await admin.from('iqc_control_specs').insert({ control_lot_id: lot.id, analyte_id: analyteId[code], assigned_mean: m, assigned_sd: s, created_by: actorId })
  }

  const { count } = await admin.from('iqc_result_values').select('id', { count: 'exact', head: true }).eq('control_lot_id', lot.id)
  if (count && !force) {
    console.log(`Lot ${cfg.lot} already has ${count} result values — skipping runs (use --force).`)
    continue
  }

  const series = { '%CD3': [], AbsCD3: [], '%CD4': [], AbsCD4: [] }
  for (const [date, ...values] of cfg.rows) {
    const { data: run, error: runError } = await admin.from('iqc_runs').insert({ instrument_id: instrument?.id ?? null, run_datetime: isoDate(date), entered_by: actorId, note: `Imported from CD4 Google Sheet (${cfg.lot})` }).select('id').single()
    if (runError) throw runError
    await admin.from('iqc_run_consumables').insert({ run_id: run.id, kind: 'trucount-tube', lot_number: TRUCOUNT_LOT, applies_scope: 'absolute-only' })
    const valueRows = ORDER.map((code, i) => {
      const v = values[i]
      const [m, s] = cfg.assigned[code]
      const next = [...series[code], v]
      const point = evaluateLatest(next, m, s)
      if (point.status !== 'rejected') series[code] = next
      return { run_id: run.id, control_lot_id: lot.id, analyte_id: analyteId[code], numeric_value: v, stat_value: v, z_score: point.z, violated_rules: point.violatedRules, status: point.status }
    })
    const { error } = await admin.from('iqc_result_values').insert(valueRows)
    if (error) throw error
    totalImported += 1
  }
  console.log(`Imported ${cfg.rows.length} runs for control lot ${cfg.lot}.`)
}

console.log(`Done. ${totalImported} runs total. Trucount tube lot ${TRUCOUNT_LOT} recorded per run (absolute-only).`)
