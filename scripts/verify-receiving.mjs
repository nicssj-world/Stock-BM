import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const beforePath = process.argv[3] ?? 'before.json'
const afterPath = process.argv[4] ?? 'after.json'
const transactionTypes = ['receive', 'issue', 'move', 'adjustment', 'reversal']
const pageSize = 1000

function fail(message) {
  throw new Error(message)
}

function required(value, name) {
  if (!value) fail(`Missing ${name}. Configure a read-only staging or local Supabase environment first.`)
  return value
}

function loadOptionalEnvFile() {
  if (process.env.NEXT_PUBLIC_BM_SUPABASE_URL && process.env.BM_SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.join(projectRoot, '.env.local')
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) process.loadEnvFile(envPath)
}

function parseMode() {
  const mode = process.argv[2]
  if (mode === '--before' || mode === '--after' || mode === '--compare') return mode
  fail('Use --before, --after, or --compare [before.json] [after.json]')
}

function outputJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function queryOrFail(query, label) {
  const { data, error } = await query
  if (error) fail(`${label} failed: ${error.message}`)
  return data
}

async function countRows(admin, table, configure) {
  let query = admin.from(table).select('id', { count: 'exact', head: true })
  if (configure) query = configure(query)
  const { count, error } = await query
  if (error) fail(`${table} count failed: ${error.message}`)
  return count ?? 0
}

async function selectAll(admin, table, columns, orderColumns) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from(table).select(columns).range(offset, offset + pageSize - 1)
    for (const column of orderColumns) query = query.order(column, { ascending: true })
    const page = await queryOrFail(query, `${table} snapshot`)
    rows.push(...(page ?? []))
    if (!page || page.length < pageSize) return rows
  }
}

function stableBalances(rows) {
  return rows
    .map((row) => ({
      lot_id: String(row.lot_id),
      location_id: String(row.location_id),
      on_hand: String(row.on_hand),
    }))
    .sort((a, b) => `${a.lot_id}:${a.location_id}`.localeCompare(`${b.lot_id}:${b.location_id}`))
}

function stableLotExpiryDates(rows) {
  return rows
    .map((row) => ({
      id: String(row.id),
      item_id: String(row.item_id),
      lot_number: String(row.lot_number),
      expiry_date: row.expiry_date,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function captureSnapshot() {
  loadOptionalEnvFile()
  const url = required(process.env.NEXT_PUBLIC_BM_SUPABASE_URL, 'NEXT_PUBLIC_BM_SUPABASE_URL')
  const serviceRoleKey = required(process.env.BM_SUPABASE_SERVICE_ROLE_KEY, 'BM_SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const [itemCount, lotRows, balanceRows, movementLineCount, transactionCounts, linkedMovementLineCount] = await Promise.all([
    countRows(admin, 'bm_stock_items'),
    selectAll(admin, 'bm_stock_lots', 'id,item_id,lot_number,expiry_date,manufacturer_barcode', ['id']),
    selectAll(admin, 'bm_stock_lot_location_balances', 'lot_id,location_id,on_hand', ['lot_id', 'location_id']),
    countRows(admin, 'bm_stock_movement_lines'),
    Promise.all(transactionTypes.map(async (transactionType) => [
      transactionType,
      await countRows(admin, 'bm_stock_transactions', (query) => query.eq('transaction_type', transactionType)),
    ])),
    countRows(
      admin,
      'bm_stock_movement_lines',
      (query) => query.select('id,bm_stock_transactions!inner(id),bm_stock_lots!inner(id),bm_stock_locations!inner(id)', { count: 'exact', head: true }),
    ),
  ])

  const transactionCountByType = Object.fromEntries(transactionCounts)
  const nonNullManufacturerBarcodeCount = lotRows.filter((row) => row.manufacturer_barcode !== null).length

  return {
    snapshot_version: 1,
    captured_at: new Date().toISOString(),
    scope: 'legacy-stock-receiving',
    item_count: itemCount,
    lot_count: lotRows.length,
    lot_expiry_dates: stableLotExpiryDates(lotRows),
    manufacturer_barcode_non_null_count: nonNullManufacturerBarcodeCount,
    balances: stableBalances(balanceRows),
    transaction_counts_by_type: transactionCountByType,
    movement_line_count: movementLineCount,
    referential_integrity: {
      movement_lines_without_transaction_lot_location: movementLineCount - linkedMovementLineCount,
    },
  }
}

function comparableSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') fail('Snapshot must be a JSON object')
  const { captured_at: _capturedAt, ...comparable } = snapshot
  return comparable
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function collectDiffs(left, right, prefix = '') {
  if (valuesEqual(left, right)) return []
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) {
    return [{ path: prefix || '$', before: left, after: right }]
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
  return keys.flatMap((key) => collectDiffs(left[key], right[key], prefix ? `${prefix}.${key}` : key))
}

async function main() {
  const mode = parseMode()
  if (mode === '--compare') {
    const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'))
    const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'))
    const diffs = collectDiffs(comparableSnapshot(before), comparableSnapshot(after))
    if (diffs.length) {
      console.error(`Reconciliation FAILED: ${diffs.length} difference(s) found.`)
      outputJson(diffs)
      process.exitCode = 1
      return
    }
    console.error('Reconciliation PASS: before and after snapshots are identical.')
    return
  }

  const snapshot = await captureSnapshot()
  outputJson(snapshot)
  console.error(`${mode.slice(2)} snapshot captured; SELECT-only.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
