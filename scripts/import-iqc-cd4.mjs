// Reset IQC data and seed CD4 IQC from two Excel workbooks.
//
// Dry-run parser:
//   npm run seed:iqc-cd4
//
// Apply to Supabase (destructive for IQC-domain tables only):
//   npm run seed:iqc-cd4 -- --ephis 9495 --apply
//
// Optional custom files:
//   npm run seed:iqc-cd4 -- --normal "C:\path\normal.xlsx" --low "C:\path\low.xlsx"

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const DEFAULT_NORMAL = path.join(os.homedir(), 'Downloads', '(normal) COE_131.xlsx')
const DEFAULT_LOW = path.join(os.homedir(), 'Downloads', '(Low) BM0526L.xlsx')
const TRUCOUNT_LOT = '25290'
const APPLY = process.argv.includes('--apply')

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function required(value, message) {
  if (!value) throw new Error(message)
  return value
}

function envValue(name) {
  return process.env[name] ?? process.env[`\uFEFF${name}`]
}

function decode(buffer) {
  return Buffer.from(buffer).toString('utf8')
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset)
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset)
}

function unzipXlsx(buffer) {
  const entries = {}
  const endSignature = 0x06054b50
  let endOffset = -1
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (readUInt32(buffer, i) === endSignature) {
      endOffset = i
      break
    }
  }
  if (endOffset < 0) throw new Error('Invalid XLSX: end of central directory not found')

  const entryCount = readUInt16(buffer, endOffset + 10)
  let offset = readUInt32(buffer, endOffset + 16)
  for (let i = 0; i < entryCount; i += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) throw new Error('Invalid XLSX: central directory entry not found')
    const method = readUInt16(buffer, offset + 10)
    const compressedSize = readUInt32(buffer, offset + 20)
    const fileNameLength = readUInt16(buffer, offset + 28)
    const extraLength = readUInt16(buffer, offset + 30)
    const commentLength = readUInt16(buffer, offset + 32)
    const localOffset = readUInt32(buffer, offset + 42)
    const fileName = decode(buffer.subarray(offset + 46, offset + 46 + fileNameLength)).replace(/\\/g, '/')

    const localNameLength = readUInt16(buffer, localOffset + 26)
    const localExtraLength = readUInt16(buffer, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    if (method === 0) {
      entries[fileName] = compressed
    } else if (method === 8) {
      entries[fileName] = zlib.inflateRawSync(compressed)
    } else {
      throw new Error(`Unsupported XLSX compression method ${method} for ${fileName}`)
    }
    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return entries
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function attr(xml, name) {
  const match = xml.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))
  return match ? xmlEscape(match[1]) : ''
}

function colIndex(cellRef) {
  const letters = cellRef.match(/[A-Z]+/i)?.[0] ?? ''
  return letters.toUpperCase().split('').reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0)
}

function excelSerialToDate(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000)
  return new Date(ms)
}

function bangkokIso(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T08:00:00+07:00`).toISOString()
}

function isoDateOnly(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDmy(value) {
  const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
  const match = String(value).match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/)
  if (!match) return null
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
  const month = months[match[2].toUpperCase()]
  if (month == null) return null
  return new Date(Date.UTC(year, month, Number(match[1])))
}

function parseSharedStrings(zip) {
  const file = zip['xl/sharedStrings.xml']
  if (!file) return []
  const xml = decode(file)
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(([si]) =>
    [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlEscape(m[1])).join(''),
  )
}

function parseWorkbook(zip) {
  const workbook = decode(zip['xl/workbook.xml'])
  const rels = decode(zip['xl/_rels/workbook.xml.rels'])
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([rel]) => [attr(rel, 'Id'), attr(rel, 'Target')]))
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(([sheet]) => {
    const relId = attr(sheet, 'r:id')
    const target = targets.get(relId)
    return {
      name: attr(sheet, 'name'),
      path: `xl/${target?.replace(/^\//, '') ?? ''}`,
    }
  })
}

function parseSheet(zip, sheetPath, sharedStrings) {
  const xml = decode(zip[sheetPath])
  const rows = new Map()
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const header = match[1]
    const body = match[2]
    const ref = attr(`<c ${header}>`, 'r')
    const rowNo = Number(ref.match(/\d+/)?.[0])
    const colNo = colIndex(ref)
    const type = attr(`<c ${header}>`, 't')
    let value = null
    if (type === 'inlineStr') {
      value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlEscape(m[1])).join('')
    } else {
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (raw == null) continue
      value = type === 's' ? sharedStrings[Number(raw)] : Number(raw)
      if (Number.isNaN(value)) value = xmlEscape(raw)
    }
    if (!rows.has(rowNo)) rows.set(rowNo, new Map())
    rows.get(rowNo).set(colNo, value)
  }
  return rows
}

function cell(rows, row, col) {
  return rows.get(row)?.get(col) ?? null
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleSd(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1))
}

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
  return { z, violatedRules: rules, status: rules.some((r) => REJECT.has(r)) ? 'rejected' : rules.includes('1-2s') ? 'warning' : 'accepted' }
}

const ANALYTES = [
  { code: '%CD3', name: '%CD3', is_absolute: false, unit: '%', group_label: 'CD4 Panel' },
  { code: '%CD4', name: '%CD4', is_absolute: false, unit: '%', group_label: 'CD4 Panel' },
  { code: 'AbsCD3', name: 'Absolute CD3', is_absolute: true, unit: 'cells/uL', group_label: 'CD4 Panel' },
  { code: 'AbsCD4', name: 'Absolute CD4', is_absolute: true, unit: 'cells/uL', group_label: 'CD4 Panel' },
]

const FILES = [
  {
    key: 'normal',
    path: argument('normal', DEFAULT_NORMAL),
    materialName: 'COE',
    level: 'Normal',
    manufacturer: 'COE',
    analyteColumns: [
      { col: 3, code: '%CD3' },
      { col: 4, code: '%CD4' },
    ],
  },
  {
    key: 'low',
    path: argument('low', DEFAULT_LOW),
    materialName: 'BD Multi-Check CD4 Low Control',
    level: 'Low',
    manufacturer: 'BD',
    analyteColumns: [
      { col: 3, code: '%CD3' },
      { col: 4, code: 'AbsCD3' },
      { col: 5, code: '%CD4' },
      { col: 6, code: 'AbsCD4' },
    ],
    trucountColumn: 7,
  },
]

function parseControlWorkbook(config) {
  if (!fs.existsSync(config.path)) throw new Error(`File not found: ${config.path}`)
  const zip = unzipXlsx(fs.readFileSync(config.path))
  const sharedStrings = parseSharedStrings(zip)
  const sheet = parseWorkbook(zip)[0]
  const rows = parseSheet(zip, sheet.path, sharedStrings)
  const lotExp = String(cell(rows, 1, 2) ?? '')
  const lotNumber = lotExp.split(/\s+Exp\./i)[0].trim()
  const expiryDate = parseDmy(lotExp)?.toISOString().slice(0, 10) ?? null
  const instrumentModel = String(cell(rows, 3, 1) ?? '').replace(/^Machine model\s*:\s*/i, '').trim() || 'BD FACSlyric'
  const parsedRuns = []
  for (let row = 9; row <= 45; row += 1) {
    const runNo = cell(rows, row, 1)
    const dateSerial = cell(rows, row, 2)
    if (dateSerial == null) continue
    const values = {}
    for (const column of config.analyteColumns) {
      const value = cell(rows, row, column.col)
      if (typeof value === 'number') values[column.code] = value
    }
    if (!Object.keys(values).length) continue
    const trucountLot = config.trucountColumn ? String(cell(rows, row, config.trucountColumn) ?? '').trim() : null
    parsedRuns.push({
      runNo: Number(runNo),
      runDatetime: bangkokIso(excelSerialToDate(dateSerial)),
      values,
      trucountLot: trucountLot || null,
    })
  }
  const stats = {}
  for (const column of config.analyteColumns) {
    const values = parsedRuns.map((run) => run.values[column.code]).filter((value) => typeof value === 'number')
    stats[column.code] = { mean: mean(values), sd: sampleSd(values), n: values.length }
  }
  return {
    ...config,
    sheetName: sheet.name,
    lotNumber,
    expiryDate,
    instrumentModel,
    runs: parsedRuns,
    stats,
  }
}

async function deleteAll(admin, table) {
  const { error } = await admin.from(table).delete().neq('id', ZERO_UUID)
  if (error) throw new Error(`Could not clear ${table}: ${error.message}`)
}

async function countRows(query, label) {
  const { count, error } = await query
  if (error) throw new Error(`Could not preflight ${label}: ${error.message}`)
  return count ?? 0
}

async function assertNoExternalIqcReferences(admin) {
  const newLotRefs = await countRows(
    admin.from('lotverif_verifications').select('id', { count: 'exact', head: true }).not('new_control_lot_id', 'is', null),
    'lotverif_verifications.new_control_lot_id',
  )
  const oldLotRefs = await countRows(
    admin.from('lotverif_verifications').select('id', { count: 'exact', head: true }).not('old_control_lot_id', 'is', null),
    'lotverif_verifications.old_control_lot_id',
  )
  const analyteRefs = await countRows(
    admin.from('lotverif_measurements').select('id', { count: 'exact', head: true }).not('analyte_id', 'is', null),
    'lotverif_measurements.analyte_id',
  )
  if (newLotRefs + oldLotRefs + analyteRefs > 0) {
    throw new Error(
      `IQC reset blocked: Lot Verification still references IQC data ` +
        `(${newLotRefs + oldLotRefs} control-lot refs, ${analyteRefs} analyte refs). ` +
        `Clear or archive those Lot Verification records first, or extend this script intentionally to reset Lot Verification too.`,
    )
  }
}

async function insertOne(admin, table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`Could not insert ${table}: ${error.message}`)
  return data.id
}

async function applyImport(datasets) {
  const envHint = 'Configure .env.local before running this command.'
  const url = required(envValue('NEXT_PUBLIC_BM_SUPABASE_URL'), `Missing NEXT_PUBLIC_BM_SUPABASE_URL. ${envHint}`)
  const serviceRoleKey = required(envValue('BM_SUPABASE_SERVICE_ROLE_KEY'), `Missing BM_SUPABASE_SERVICE_ROLE_KEY. ${envHint}`)
  const ephisId = required(argument('ephis'), 'Use --ephis <employee-code> (an existing Molecular-CBH QMS user)')
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: user, error: userError } = await admin.from('nipt_users').select('id').eq('ephis_id', ephisId).maybeSingle()
  if (userError) throw userError
  const actorId = required(user?.id, `No nipt_users with ephis_id ${ephisId}`)

  await assertNoExternalIqcReferences(admin)

  console.log('Clearing IQC-domain data...')
  const { error: attachmentError } = await admin.from('bm_attachments').delete().eq('module', 'iqc')
  if (attachmentError) throw new Error(`Could not clear IQC attachments: ${attachmentError.message}`)
  for (const table of [
    'iqc_corrective_actions',
    'iqc_result_values',
    'iqc_run_consumables',
    'iqc_runs',
    'iqc_uncertainty_components',
    'iqc_uncertainty_budgets',
    'iqc_tea_specs',
    'iqc_control_specs',
    'iqc_control_lots',
    'iqc_control_materials',
    'iqc_instruments',
    'iqc_analytes',
  ]) {
    await deleteAll(admin, table)
  }

  const instrumentId = await insertOne(admin, 'iqc_instruments', {
    code: 'FACSLYRIC',
    name: 'BD FACSlyric',
    model: datasets[0]?.instrumentModel ?? 'BD FACSlyric',
    created_by: actorId,
  })

  const analyteIds = {}
  for (const analyte of ANALYTES) {
    analyteIds[analyte.code] = await insertOne(admin, 'iqc_analytes', {
      ...analyte,
      data_type: 'quantitative',
      scale: 'linear',
      created_by: actorId,
    })
  }

  let runCount = 0
  let valueCount = 0
  let trucountCount = 0
  for (const dataset of datasets) {
    const materialId = await insertOne(admin, 'iqc_control_materials', {
      name: dataset.materialName,
      level: dataset.level,
      manufacturer: dataset.manufacturer,
      created_by: actorId,
    })
    const controlLotId = await insertOne(admin, 'iqc_control_lots', {
      control_material_id: materialId,
      lot_number: dataset.lotNumber,
      expiry_date: dataset.expiryDate,
      created_by: actorId,
    })
    for (const column of dataset.analyteColumns) {
      const stat = dataset.stats[column.code]
      await insertOne(admin, 'iqc_control_specs', {
        control_lot_id: controlLotId,
        analyte_id: analyteIds[column.code],
        assigned_mean: null,
        assigned_sd: null,
        lab_mean: stat.mean,
        lab_sd: stat.sd,
        lab_n: stat.n,
        lab_locked_at: null,
        active_limit: 'lab',
        created_by: actorId,
      })
    }

    const series = Object.fromEntries(dataset.analyteColumns.map((column) => [column.code, []]))
    for (const run of dataset.runs) {
      const runId = await insertOne(admin, 'iqc_runs', {
        instrument_id: instrumentId,
        run_no: run.runNo,
        run_datetime: run.runDatetime,
        note: `Imported from ${path.basename(dataset.path)}`,
        entered_by: actorId,
      })
      runCount += 1
      if (run.trucountLot) {
        await insertOne(admin, 'iqc_run_consumables', {
          run_id: runId,
          kind: 'trucount-tube',
          lot_number: run.trucountLot,
          applies_scope: 'absolute-only',
        })
        trucountCount += 1
      }
      const resultRows = []
      for (const column of dataset.analyteColumns) {
        const value = run.values[column.code]
        if (value == null) continue
        const stat = dataset.stats[column.code]
        const next = [...series[column.code], value]
        const point = evaluateLatest(next, stat.mean, stat.sd)
        if (point.status !== 'rejected') series[column.code] = next
        resultRows.push({
          run_id: runId,
          control_lot_id: controlLotId,
          analyte_id: analyteIds[column.code],
          numeric_value: value,
          stat_value: value,
          z_score: point.z,
          violated_rules: point.violatedRules,
          status: point.status,
        })
      }
      const { error: valueError } = await admin.from('iqc_result_values').insert(resultRows)
      if (valueError) throw new Error(`Could not insert iqc_result_values: ${valueError.message}`)
      valueCount += resultRows.length
    }
  }
  return { runCount, valueCount, trucountCount }
}

function printSummary(datasets) {
  let totalRuns = 0
  let totalValues = 0
  let totalTrucount = 0
  for (const dataset of datasets) {
    const valueCount = dataset.runs.reduce((sum, run) => sum + Object.keys(run.values).length, 0)
    const trucountCount = dataset.runs.filter((run) => run.trucountLot).length
    totalRuns += dataset.runs.length
    totalValues += valueCount
    totalTrucount += trucountCount
    console.log(`\n${dataset.level}: ${dataset.materialName} · ${dataset.lotNumber} · EXP ${dataset.expiryDate}`)
    console.log(`  file: ${dataset.path}`)
    console.log(`  sheet: ${dataset.sheetName}`)
    console.log(`  runs: ${dataset.runs.length}`)
    console.log(`  result values: ${valueCount}`)
    if (trucountCount) console.log(`  Trucount tube lot ${TRUCOUNT_LOT}: ${trucountCount} runs`)
    for (const column of dataset.analyteColumns) {
      const stat = dataset.stats[column.code]
      console.log(`  ${column.code}: mean=${stat.mean.toFixed(6)} sd=${stat.sd.toFixed(6)} n=${stat.n}`)
    }
  }
  console.log(`\nTOTAL: ${totalRuns} runs, ${totalValues} result values, ${totalTrucount} Trucount consumables`)
}

const datasets = FILES.map(parseControlWorkbook)
printSummary(datasets)

if (!APPLY) {
  console.log('\nDry run only. Add --apply --ephis <employee-code> to clear IQC data and import this dataset.')
} else {
  const result = await applyImport(datasets)
  console.log(`\nImported to Supabase: ${result.runCount} runs, ${result.valueCount} result values, ${result.trucountCount} Trucount consumables.`)
}
