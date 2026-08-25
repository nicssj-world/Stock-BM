// Import historical Cobas 8800 HIV/HBV/HCV viral-load IQC results.
// Dry run: npm run seed:iqc-vl -- --file "C:\path\file.xlsx"
// Apply:   npm run seed:iqc-vl -- --file "C:\path\file.xlsx" --ephis 9495 --apply
// Missing lots are skipped by default. Add --allow-new-lots only when creating lots is intentional.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_FILE = path.join(os.homedir(), 'Downloads', 'ExportFile-ControlCSVExport_x800-220658_20260811T124418.xlsx')
const APPLY = process.argv.includes('--apply')
const ALLOW_NEW_LOTS = process.argv.includes('--allow-new-lots')
const TODAY = new Date().toISOString().slice(0, 10)
const ALLOWED_RULES = new Set(['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'])
const REJECT_RULES = new Set(['1-3s', '2-2s', 'R-4s', '4-1s', '10x'])

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
    if (method === 0) entries[fileName] = compressed
    else if (method === 8) entries[fileName] = zlib.inflateRawSync(compressed)
    else throw new Error(`Unsupported XLSX compression method ${method} for ${fileName}`)
    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return entries
}

function decodeXml(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function attr(xml, name) {
  const match = xml.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function columnIndex(cellRef) {
  const letters = cellRef.match(/[A-Z]+/i)?.[0] ?? ''
  return letters.toUpperCase().split('').reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0)
}

function parseSharedStrings(zip) {
  const file = zip['xl/sharedStrings.xml']
  if (!file) return []
  const xml = decode(file)
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(([si]) =>
    [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join(''),
  )
}

function parseWorkbook(zip) {
  const workbook = decode(zip['xl/workbook.xml'])
  const rels = decode(zip['xl/_rels/workbook.xml.rels'])
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([rel]) => [attr(rel, 'Id'), attr(rel, 'Target')]))
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(([sheet]) => {
    const relId = attr(sheet, 'r:id')
    const target = targets.get(relId)
    return { name: attr(sheet, 'name'), path: `xl/${target?.replace(/^\//, '') ?? ''}` }
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
    const colNo = columnIndex(ref)
    const type = attr(`<c ${header}>`, 't')
    let value = null
    if (type === 'inlineStr') {
      value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('')
    } else {
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (raw == null) continue
      value = type === 's' ? sharedStrings[Number(raw)] : Number(raw)
      if (Number.isNaN(value)) value = decodeXml(raw)
    }
    if (!rows.has(rowNo)) rows.set(rowNo, new Map())
    rows.get(rowNo).set(colNo, value)
  }
  return rows
}

function cell(rows, rowNo, colNo) {
  return rows.get(rowNo)?.get(colNo) ?? null
}

function pad(value, length = 2) {
  return String(value).padStart(length, '0')
}

function excelDate(value) {
  const serial = Number(value)
  if (!Number.isFinite(serial)) throw new Error(`Invalid Excel date serial: ${value}`)
  const milliseconds = Math.round((serial - 25569) * 86400 * 1000)
  const date = new Date(milliseconds)
  const dateOnly = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  const local = `${dateOnly}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}+07:00`
  return { dateOnly, iso: new Date(local).toISOString() }
}

function dateOnlyFromIso(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const byType = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function parseNumber(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseSource(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)
  const zip = unzipXlsx(fs.readFileSync(filePath))
  const sharedStrings = parseSharedStrings(zip)
  const sheet = parseWorkbook(zip)[0]
  if (!sheet) throw new Error('XLSX has no worksheet')
  const rows = parseSheet(zip, sheet.path, sharedStrings)
  const headerRow = Math.min(...rows.keys())
  const headers = new Map()
  for (const [colNo, value] of rows.get(headerRow) ?? []) headers.set(String(value), colNo)
  const requiredHeaders = [
    'Control Name', 'Control Type', 'Test', 'Control Result', 'Result', 'Result Unit',
    'Result Creation Date/Time', 'Run ID', 'Instrument Name', 'Control Mini Rack Lot Number',
    'Control Cassette Expiry Date',
  ]
  for (const header of requiredHeaders) if (!headers.has(header)) throw new Error(`Missing XLSX column: ${header}`)

  const testPrefix = { 'x800 HIV-1': 'HIV', 'x800 HBV': 'HBV', 'x800 HCV': 'HCV' }
  const controlLevel = { 'HxV H (+) C': 'HPC', 'HxV L (+) C': 'LPC', '(-) C': 'Normal' }
  const sourceRows = []
  for (const rowNo of [...rows.keys()].sort((a, b) => a - b)) {
    if (rowNo === headerRow) continue
    const get = (header) => cell(rows, rowNo, headers.get(header))
    const test = String(get('Test') ?? '').trim()
    const prefix = testPrefix[test]
    const controlName = String(get('Control Name') ?? '').trim()
    const level = controlLevel[controlName]
    const sourceRunId = String(get('Run ID') ?? '').trim()
    const lotNumber = String(get('Control Mini Rack Lot Number') ?? '').trim()
    const date = excelDate(get('Result Creation Date/Time'))
    const expiryDate = excelDate(get('Control Cassette Expiry Date')).dateOnly
    if (!prefix) throw new Error(`Row ${rowNo}: unsupported test ${test}`)
    if (!level) throw new Error(`Row ${rowNo}: unsupported control name ${controlName}`)
    if (!sourceRunId) throw new Error(`Row ${rowNo}: missing Run ID`)
    if (!lotNumber) throw new Error(`Row ${rowNo}: missing control lot`)
    if (String(get('Control Result') ?? '').trim() !== 'Valid') throw new Error(`Row ${rowNo}: Control Result is not Valid`)
    const analyteCode = `${prefix}-VL (${level})`
    const result = get('Result')
    const unit = String(get('Result Unit') ?? '').trim()
    if (level === 'Normal') {
      if (String(result ?? '').trim() !== 'Valid' || unit) throw new Error(`Row ${rowNo}: unexpected Normal result format`)
    } else {
      const numericValue = parseNumber(result)
      const expectedUnit = prefix === 'HIV' ? 'cp/mL' : 'IU/mL'
      if (numericValue == null || numericValue <= 0) throw new Error(`Row ${rowNo}: ${analyteCode} result is not a positive number`)
      if (unit !== expectedUnit) throw new Error(`Row ${rowNo}: ${analyteCode} expected ${expectedUnit}, got ${unit}`)
    }
    sourceRows.push({
      rowNo,
      sourceRunId,
      runDatetime: date.iso,
      localDate: date.dateOnly,
      test,
      prefix,
      controlName,
      level,
      analyteCode,
      lotNumber,
      expiryDate,
      numericValue: level === 'Normal' ? null : parseNumber(result),
      qualitativeValue: level === 'Normal' ? 'Not detected' : null,
    })
  }

  const groups = new Map()
  for (const row of sourceRows) groups.set(row.sourceRunId, [...(groups.get(row.sourceRunId) ?? []), row])
  const sourceRuns = [...groups.entries()].map(([sourceRunId, values]) => {
    const sorted = [...values].sort((a, b) => a.runDatetime.localeCompare(b.runDatetime) || a.rowNo - b.rowNo)
    const keys = new Set(sorted.map(valueSignature))
    if (keys.size !== sorted.length) throw new Error(`Source Run ID ${sourceRunId} contains a duplicate analyte/lot/value`) 
    const localDates = new Set(sorted.map((row) => row.localDate))
    if (localDates.size !== 1) throw new Error(`Source Run ID ${sourceRunId} spans multiple local dates`)
    return { sourceRunId, runDatetime: sorted[0].runDatetime, localDate: sorted[0].localDate, values: sorted }
  }).sort((a, b) => a.runDatetime.localeCompare(b.runDatetime) || a.sourceRunId.localeCompare(b.sourceRunId))

  return { sheetName: sheet.name, sourceRows, sourceRuns }
}

function valueSignature(row) {
  return row.numericValue == null
    ? `${row.analyteCode}|${row.lotNumber}|q:${row.qualitativeValue}`
    : `${row.analyteCode}|${row.lotNumber}|n:${row.numericValue}`
}

function dbValueSignature(row, analyteById, lotById) {
  const analyte = analyteById.get(row.analyte_id)
  const lot = lotById.get(row.control_lot_id)
  if (!analyte || !lot) return null
  return row.numeric_value == null
    ? `${analyte.code}|${lot.lot_number}|q:${row.qualitative_value}`
    : `${analyte.code}|${lot.lot_number}|n:${Number(row.numeric_value)}`
}

function materialKey(prefix, level) {
  return `${prefix}|${level === 'Normal' ? 'Normal' : 'HPC/LPC'}`
}

function materialPayload(prefix, level, actorId) {
  return { name: `${prefix}-VL Control`, level: level === 'Normal' ? 'Normal' : 'HPC/LPC', manufacturer: 'Roche', created_by: actorId }
}

function lotKey(materialId, lotNumber) {
  return `${materialId}|${lotNumber}`
}

function evaluateLatest(series, meanValue, sdValue, enabledRules = [...ALLOWED_RULES]) {
  if (!(sdValue > 0)) return { z: 0, violatedRules: [], status: 'accepted' }
  const enabled = new Set(enabledRules)
  const zs = series.map((value) => (value - meanValue) / sdValue)
  const index = zs.length - 1
  const z = zs[index]
  const rules = []
  if (Math.abs(z) > 3 && enabled.has('1-3s')) rules.push('1-3s')
  if (index >= 1) {
    const previous = zs[index - 1]
    if (enabled.has('2-2s') && ((z > 2 && previous > 2) || (z < -2 && previous < -2))) rules.push('2-2s')
    if (enabled.has('R-4s') && Math.abs(z - previous) > 4) rules.push('R-4s')
  }
  if (index >= 3) {
    const window = zs.slice(index - 3, index + 1)
    if (enabled.has('4-1s') && (window.every((value) => value > 1) || window.every((value) => value < -1))) rules.push('4-1s')
  }
  if (index >= 9) {
    const window = zs.slice(index - 9, index + 1)
    if (enabled.has('10x') && (window.every((value) => value > 0) || window.every((value) => value < 0))) rules.push('10x')
  }
  if (enabled.has('1-2s') && Math.abs(z) > 2 && !rules.includes('1-3s')) rules.push('1-2s')
  return {
    z,
    violatedRules: rules,
    status: rules.some((rule) => REJECT_RULES.has(rule)) ? 'rejected' : rules.includes('1-2s') ? 'warning' : 'accepted',
  }
}

function parseRules(value) {
  const rules = (Array.isArray(value) ? value : []).filter((rule) => typeof rule === 'string' && ALLOWED_RULES.has(rule))
  return rules.length ? rules : [...ALLOWED_RULES]
}

function activeStats(spec) {
  if (!spec) return { meanValue: null, sdValue: null }
  if (spec.active_limit === 'lab' && spec.lab_mean != null && spec.lab_sd != null) return { meanValue: Number(spec.lab_mean), sdValue: Number(spec.lab_sd) }
  return { meanValue: spec.assigned_mean == null ? null : Number(spec.assigned_mean), sdValue: spec.assigned_sd == null ? null : Number(spec.assigned_sd) }
}

async function queryAll(admin, table, select = '*') {
  const { data, error } = await admin.from(table).select(select)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

async function loadDatabase(admin) {
  const [analytes, instruments, materials, lots, specs, plans, runs, resultValues] = await Promise.all([
    queryAll(admin, 'iqc_analytes'),
    queryAll(admin, 'iqc_instruments'),
    queryAll(admin, 'iqc_control_materials'),
    queryAll(admin, 'iqc_control_lots'),
    queryAll(admin, 'iqc_control_specs'),
    queryAll(admin, 'iqc_control_plans'),
    queryAll(admin, 'iqc_runs'),
    queryAll(admin, 'iqc_result_values'),
  ])
  const analyteByCode = new Map(analytes.map((row) => [row.code, row]))
  const analyteById = new Map(analytes.map((row) => [row.id, row]))
  const instrument = instruments.find((row) => row.code === 'LAB-BM-15-002')
  if (!instrument) throw new Error('IQC instrument LAB-BM-15-002 (Cobas 8800 Sn5046) was not found')
  const materialByKey = new Map(materials.map((row) => [materialKey(row.name.replace(/-VL Control$/i, ''), row.level), row]))
  const materialById = new Map(materials.map((row) => [row.id, row]))
  const lotById = new Map(lots.map((row) => [row.id, row]))
  const lotByKey = new Map(lots.map((row) => [lotKey(row.control_material_id, row.lot_number), row]))
  const runById = new Map(runs.map((row) => [row.id, row]))
  const existingCounts = new Map()
  for (const value of resultValues) {
    if (value.is_voided) continue
    const run = runById.get(value.run_id)
    const signature = dbValueSignature(value, analyteById, lotById)
    if (!run || !signature) continue
    const key = `${dateOnlyFromIso(run.run_datetime)}|${signature}`
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1)
  }
  return { analytes, analyteByCode, analyteById, instruments, instrument, materials, materialByKey, materialById, lots, lotById, lotByKey, specs, plans, runs, resultValues, existingCounts }
}

function planImport(source, db) {
  const neededAnalytes = new Set(source.sourceRows.map((row) => row.analyteCode))
  for (const code of neededAnalytes) if (!db.analyteByCode.has(code)) throw new Error(`Missing IQC analyte in database: ${code}`)
  const remaining = new Map(db.existingCounts)
  const plannedRuns = []
  const skippedLotKeys = new Set()
  let skippedRows = 0
  let matchedRows = 0
  for (const sourceRun of source.sourceRuns) {
    const missing = []
    for (const row of sourceRun.values) {
      const material = db.materialByKey.get(materialKey(row.prefix, row.level))
      const existingLot = material ? db.lotByKey.get(lotKey(material.id, row.lotNumber)) : null
      if (!ALLOW_NEW_LOTS && !existingLot) {
        skippedRows += 1
        skippedLotKeys.add(`${row.analyteCode}|${row.lotNumber}`)
        continue
      }
      const key = `${row.localDate}|${valueSignature(row)}`
      const available = remaining.get(key) ?? 0
      if (available > 0) {
        remaining.set(key, available - 1)
        matchedRows += 1
      } else {
        missing.push(row)
      }
    }
    if (missing.length) plannedRuns.push({ ...sourceRun, values: missing })
  }

  const plannedMaterials = new Map()
  const plannedLots = new Map()
  for (const sourceRun of plannedRuns) {
    for (const row of sourceRun.values) {
      const key = materialKey(row.prefix, row.level)
      let material = db.materialByKey.get(key)
      if (!material) {
        material = { id: `new:${key}`, ...materialPayload(row.prefix, row.level, null) }
        db.materialByKey.set(key, material)
        plannedMaterials.set(key, material)
      }
      const keyWithLot = lotKey(material.id, row.lotNumber)
      if (!db.lotByKey.has(keyWithLot)) {
        if (!ALLOW_NEW_LOTS) throw new Error(`Missing existing control lot ${row.lotNumber} for ${row.analyteCode}`)
        const lot = {
          id: `new:${keyWithLot}`,
          control_material_id: material.id,
          lot_number: row.lotNumber,
          expiry_date: row.expiryDate,
          is_active: row.expiryDate >= TODAY,
        }
        db.lotByKey.set(keyWithLot, lot)
        plannedLots.set(keyWithLot, lot)
      } else {
        const existing = db.lotByKey.get(keyWithLot)
        if (existing.expiry_date && existing.expiry_date !== row.expiryDate) throw new Error(`Lot ${row.lotNumber} expiry mismatch: database=${existing.expiry_date}, file=${row.expiryDate}`)
      }
    }
  }
  return {
    plannedRuns,
    plannedMaterials,
    plannedLots,
    matchedRows,
    skippedRows,
    skippedLotKeys,
    newRows: plannedRuns.reduce((sum, run) => sum + run.values.length, 0),
  }
}

async function findActorId(admin, ephis) {
  const { data, error } = await admin.from('nipt_users').select('id,ephis_id,display_name').eq('ephis_id', ephis).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`No nipt_users with ephis_id ${ephis}`)
  return data
}

async function insertOne(admin, table, payload) {
  const { data, error } = await admin.from(table).insert(payload).select('id').single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data.id
}

async function recalculateStatuses(admin, lotId, analyteId, db) {
  const analyte = db.analyteById.get(analyteId)
  if (!analyte) return
  const spec = db.specs.find((row) => row.control_lot_id === lotId && row.analyte_id === analyteId)
  const { meanValue, sdValue } = activeStats(spec)
  const plans = db.plans.filter((row) => row.analyte_id === analyteId && row.is_active)
  const rulesByInstrument = new Map(plans.map((row) => [row.instrument_id, parseRules(row.westgard_rules)]))
  const { data, error } = await admin
    .from('iqc_result_values')
    .select('id,stat_value,qualitative_value,is_voided,iqc_runs(run_datetime,instrument_id)')
    .eq('control_lot_id', lotId)
    .eq('analyte_id', analyteId)
  if (error) throw error
  const ordered = (data ?? []).map((row) => ({ row, when: row.iqc_runs?.run_datetime ?? '', id: row.id }))
    .sort((a, b) => a.when.localeCompare(b.when) || a.id.localeCompare(b.id))
  const acceptedSeries = []
  for (const item of ordered) {
    const row = item.row
    if (row.is_voided) continue
    let z = null
    let violatedRules = []
    let status = 'accepted'
    if (analyte.data_type === 'qualitative') {
      const expected = spec?.expected_qualitative
      const actual = String(row.qualitative_value ?? '').trim()
      status = expected && actual && expected.trim().toLowerCase() !== actual.toLowerCase() ? 'rejected' : 'accepted'
    } else if (row.stat_value != null && meanValue != null && sdValue != null && sdValue > 0) {
      const instrumentId = row.iqc_runs?.instrument_id ?? ''
      const point = evaluateLatest([...acceptedSeries, Number(row.stat_value)], meanValue, sdValue, rulesByInstrument.get(instrumentId))
      z = point.z
      violatedRules = point.violatedRules
      status = point.status
      if (status === 'rejected') acceptedSeries.length = 0
      else acceptedSeries.push(Number(row.stat_value))
    } else if (row.stat_value != null) {
      acceptedSeries.push(Number(row.stat_value))
    }
    const { error: updateError } = await admin.from('iqc_result_values').update({ z_score: z, violated_rules: violatedRules, status }).eq('id', row.id)
    if (updateError) throw updateError
  }
}

async function applyImport(source, db, plan, actor) {
  const materialByKey = db.materialByKey
  const lotById = db.lotById
  const lotByKey = db.lotByKey
  const insertedRunIds = []
  const insertedLotIds = []
  const insertedMaterialIds = []
  const affectedKeys = new Set()
  try {
    for (const [key, material] of plan.plannedMaterials) {
      const previousId = material.id
      const id = await insertOne(admin, 'iqc_control_materials', materialPayload(material.name.replace(/-VL Control$/i, ''), material.level, actor.id))
      insertedMaterialIds.push(id)
      material.id = id
      materialByKey.set(key, material)
      for (const lot of plan.plannedLots.values()) if (lot.control_material_id === previousId) lot.control_material_id = id
    }
    for (const [oldKey, lot] of plan.plannedLots) {
      const material = materialByKey.get([...materialByKey.entries()].find(([, item]) => item.id === lot.control_material_id)?.[0])
      if (!material) throw new Error(`Missing material for planned lot ${lot.lot_number}`)
      const id = await insertOne(admin, 'iqc_control_lots', {
        control_material_id: material.id,
        lot_number: lot.lot_number,
        expiry_date: lot.expiry_date,
        is_active: lot.is_active,
        created_by: actor.id,
      })
      insertedLotIds.push(id)
      lot.id = id
      lot.control_material_id = material.id
      lotById.set(id, lot)
      lotByKey.set(lotKey(material.id, lot.lot_number), lot)
      if (oldKey !== lotKey(material.id, lot.lot_number)) lotByKey.delete(oldKey)
    }

    for (const sourceRun of plan.plannedRuns) {
      const runId = await insertOne(admin, 'iqc_runs', {
        instrument_id: db.instrument.id,
        run_no: null,
        run_datetime: sourceRun.runDatetime,
        note: null,
        entered_by: actor.id,
      })
      insertedRunIds.push(runId)
      const valueRows = sourceRun.values.map((row) => {
        const analyte = db.analyteByCode.get(row.analyteCode)
        const material = materialByKey.get(materialKey(row.prefix, row.level))
        const lot = [...lotById.values()].find((item) => item.control_material_id === material.id && item.lot_number === row.lotNumber)
        if (!analyte || !material || !lot) throw new Error(`Could not resolve ${row.analyteCode} / ${row.lotNumber}`)
        affectedKeys.add(`${lot.id}:${analyte.id}`)
        return {
          run_id: runId,
          control_lot_id: lot.id,
          analyte_id: analyte.id,
          numeric_value: row.numericValue,
          stat_value: row.numericValue == null ? null : Math.log10(row.numericValue),
          qualitative_value: row.qualitativeValue,
          z_score: null,
          violated_rules: [],
          status: 'accepted',
        }
      })
      const { error } = await admin.from('iqc_result_values').insert(valueRows)
      if (error) throw error
    }

    for (const sourceRow of source.sourceRows) {
      const analyte = db.analyteByCode.get(sourceRow.analyteCode)
      const material = materialByKey.get(materialKey(sourceRow.prefix, sourceRow.level))
      const lot = [...lotById.values()].find((item) => item.control_material_id === material.id && item.lot_number === sourceRow.lotNumber)
      if (analyte && lot) affectedKeys.add(`${lot.id}:${analyte.id}`)
    }
    for (const key of affectedKeys) {
      const [lotId, analyteId] = key.split(':')
      await recalculateStatuses(admin, lotId, analyteId, db)
    }
  } catch (error) {
    if (insertedRunIds.length) await admin.from('iqc_runs').delete().in('id', insertedRunIds)
    if (insertedLotIds.length) await admin.from('iqc_control_lots').delete().in('id', insertedLotIds)
    if (insertedMaterialIds.length) await admin.from('iqc_control_materials').delete().in('id', insertedMaterialIds)
    throw error
  }
  return { insertedRuns: plan.plannedRuns.length, insertedRows: plan.newRows, affectedKeys: affectedKeys.size }
}

const filePath = argument('file', DEFAULT_FILE)
const source = parseSource(filePath)
const url = required(envValue('NEXT_PUBLIC_BM_SUPABASE_URL'), 'Missing NEXT_PUBLIC_BM_SUPABASE_URL in .env.local')
const serviceRoleKey = required(envValue('BM_SUPABASE_SERVICE_ROLE_KEY'), 'Missing BM_SUPABASE_SERVICE_ROLE_KEY in .env.local')
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const db = await loadDatabase(admin)
const plan = planImport(source, db)

console.log(`Source sheet: ${source.sheetName}`)
console.log(`Source data: ${source.sourceRuns.length} runs, ${source.sourceRows.length} values, ${new Set(source.sourceRows.map((row) => row.lotNumber)).size} control lots`)
console.log(`Mode: ${ALLOW_NEW_LOTS ? 'allow new lots' : 'existing lots only'}`)
console.log(`Existing matches: ${plan.matchedRows} values`)
if (plan.skippedRows) console.log(`Skipped non-existing lots: ${plan.skippedRows} values across ${plan.skippedLotKeys.size} lot/analyte keys`)
console.log(`To add: ${plan.plannedRuns.length} runs, ${plan.newRows} values`)
console.log(`New control materials: ${plan.plannedMaterials.size}`)
console.log(`New control lots: ${plan.plannedLots.size}`)
if (process.argv.includes('--details')) {
  const additions = new Map()
  for (const run of plan.plannedRuns) {
    for (const row of run.values) {
      const key = `${row.analyteCode}|${row.lotNumber}`
      additions.set(key, (additions.get(key) ?? 0) + 1)
    }
  }
  for (const [key, count] of [...additions].sort(([a], [b]) => a.localeCompare(b))) console.log(`  add ${count} · ${key}`)
  for (const [, lot] of [...plan.plannedLots].sort(([a], [b]) => a.localeCompare(b))) console.log(`  lot ${lot.lot_number} · exp ${lot.expiry_date} · ${lot.is_active ? 'active' : 'inactive'}`)
}

if (!APPLY) {
  console.log('Dry run only. Add --apply --ephis <employee-code> to write missing IQC VL data.')
} else {
  const ephis = required(argument('ephis', ''), 'Use --ephis <employee-code> when applying')
  const actor = await findActorId(admin, ephis)
  const result = await applyImport(source, db, plan, actor)
  console.log(`Imported: ${result.insertedRuns} runs, ${result.insertedRows} values, recalculated ${result.affectedKeys} lot/analyte series.`)
}
