import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const transactionTypes = ['receive', 'issue', 'move', 'adjustment', 'reversal']
const pageSize = 1000
const args = process.argv.slice(2)

function fail(message) {
  throw new Error(message)
}

function required(value, name) {
  if (!value) fail(`Missing ${name}. Configure the explicitly selected read-only local or production environment first.`)
  return value
}

function loadOptionalEnvFile() {
  if (process.env.NEXT_PUBLIC_BM_SUPABASE_URL && process.env.BM_SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.join(projectRoot, '.env.local')
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) process.loadEnvFile(envPath)
}

function flagValue(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function parseOptions() {
  const mode = args[0]
  if (mode === '--before' || mode === '--after' || mode === '--compare') return mode
  fail('Use --before|--after|--compare with --target local|production and --read-only; production also requires --confirm-production and --backup-reference.')
}

function releaseContext(mode) {
  const target = flagValue('--target') ?? 'local'
  if (!['local', 'production'].includes(target)) fail('Target must be local or production. Staging is not configured for this project and production is never an implicit substitute.')
  const readOnly = args.includes('--read-only')
  const confirmedProduction = args.includes('--confirm-production')
  const backupReference = flagValue('--backup-reference') ?? null
  if (target === 'production') {
    if (!readOnly) fail('Production reconciliation is SELECT-only and requires --read-only.')
    if (!confirmedProduction) fail('Production target must be explicitly confirmed with --confirm-production.')
    if (!backupReference) fail('Production reconciliation requires --backup-reference for the recoverable backup verified before migration.')
  }
  const file = flagValue('--file')
  const beforeFile = flagValue('--before-file') ?? 'before.json'
  const afterFile = flagValue('--after-file') ?? 'after.json'
  if (mode === '--compare' && (args.includes('--before-file') || args.includes('--after-file')) === false && args.includes('--file')) fail('Compare uses --before-file and --after-file, not --file.')
  return { target, readOnly, confirmedProduction, backupReference, file, beforeFile, afterFile }
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

function stableStockItems(rows) {
  return rows
    .map((row) => ({
      id: String(row.id),
      item_code: String(row.item_code),
      name: String(row.name),
      category_id: String(row.category_id),
      unit: String(row.unit),
      minimum_stock: String(row.minimum_stock),
      expiry_warning_days: Number(row.expiry_warning_days),
      storage_condition: row.storage_condition,
      supplier: row.supplier,
      catalog_no: row.catalog_no,
      manufacturer: row.manufacturer,
      manufacturer_barcode: row.manufacturer_barcode,
      track_lot: Boolean(row.track_lot),
      track_expiry: Boolean(row.track_expiry),
      is_active: Boolean(row.is_active),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function stableLots(rows) {
  return rows
    .map((row) => ({
      id: String(row.id),
      item_id: String(row.item_id),
      lot_number: String(row.lot_number),
      expiry_date: row.expiry_date,
      manufacturer_barcode: row.manufacturer_barcode,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function stableTransactions(rows) {
  return rows
    .map((row) => ({
      id: String(row.id),
      transaction_type: String(row.transaction_type),
      reference_text: row.reference_text,
      purpose_text: row.purpose_text,
      note: row.note,
      override_reason: row.override_reason,
      expired_confirmed: Boolean(row.expired_confirmed),
      source_transaction_id: row.source_transaction_id,
      created_by: String(row.created_by),
      created_at: row.created_at,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function stableMovementLines(rows) {
  return rows
    .map((row) => ({
      id: String(row.id),
      transaction_id: String(row.transaction_id),
      lot_id: String(row.lot_id),
      location_id: String(row.location_id),
      quantity: String(row.quantity),
      created_at: row.created_at,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function captureSnapshot(context) {
  loadOptionalEnvFile()
  const url = required(process.env.NEXT_PUBLIC_BM_SUPABASE_URL, 'NEXT_PUBLIC_BM_SUPABASE_URL')
  const reconciliationKey = context.target === 'production'
    ? required(process.env.BM_SUPABASE_RECONCILIATION_READONLY_KEY, 'BM_SUPABASE_RECONCILIATION_READONLY_KEY')
    : required(process.env.BM_SUPABASE_SERVICE_ROLE_KEY, 'BM_SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, reconciliationKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const [itemRows, lotRows, balanceRows, locationRows, movementLines, transactionRows, transactionCounts, linkedMovementLineCount, policyRows] = await Promise.all([
    selectAll(admin, 'bm_stock_items', 'id,item_code,name,category_id,unit,minimum_stock,expiry_warning_days,storage_condition,supplier,catalog_no,manufacturer,manufacturer_barcode,track_lot,track_expiry,is_active', ['id']),
    selectAll(admin, 'bm_stock_lots', 'id,item_id,lot_number,expiry_date,manufacturer_barcode', ['id']),
    selectAll(admin, 'bm_stock_lot_location_balances', 'lot_id,location_id,on_hand', ['lot_id', 'location_id']),
    selectAll(admin, 'bm_stock_locations', 'id', ['id']),
    selectAll(admin, 'bm_stock_movement_lines', 'id,transaction_id,lot_id,location_id,quantity,created_at', ['id']),
    selectAll(admin, 'bm_stock_transactions', 'id,transaction_type,reference_text,purpose_text,note,override_reason,expired_confirmed,source_transaction_id,created_by,created_at', ['id']),
    Promise.all(transactionTypes.map(async (transactionType) => [
      transactionType,
      await countRows(admin, 'bm_stock_transactions', (query) => query.eq('transaction_type', transactionType)),
    ])),
    countRows(
      admin,
      'bm_stock_movement_lines',
      (query) => query.select('id,bm_stock_transactions!inner(id),bm_stock_lots!inner(id),bm_stock_locations!inner(id)', { count: 'exact', head: true }),
    ),
    selectAll(admin, 'bm_receiving_policies', 'version,is_enabled,expiry_exception_enabled,is_approved', ['version']),
  ])

  const transactionCountByType = Object.fromEntries(transactionCounts)
  const nonNullManufacturerBarcodeCount = lotRows.filter((row) => row.manufacturer_barcode !== null).length
  const itemIds = new Set(itemRows.map((row) => String(row.id)))
  const lotIds = new Set(lotRows.map((row) => String(row.id)))
  const locationIds = new Set(locationRows.map((row) => String(row.id)))
  const orphanLotCount = lotRows.filter((row) => !itemIds.has(String(row.item_id))).length
  const orphanBalanceCount = balanceRows.filter((row) => !lotIds.has(String(row.lot_id)) || !locationIds.has(String(row.location_id))).length
  const lotKeys = new Set()
  let uniqueLotViolationCount = 0
  for (const row of lotRows) {
    const key = `${row.item_id}:${row.lot_number}`
    if (lotKeys.has(key)) uniqueLotViolationCount += 1
    lotKeys.add(key)
  }
  const latestPolicy = [...policyRows].sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null
  if (context.target === 'production' && (latestPolicy?.is_enabled || latestPolicy?.expiry_exception_enabled)) {
    fail('Production snapshot refused: receiving or expiry_exception_enabled is already ON. Keep both controls OFF.')
  }

  return {
    snapshot_version: 2,
    captured_at: new Date().toISOString(),
    release_context: {
      target: context.target,
      read_only: context.readOnly,
      backup_reference: context.backupReference,
    },
    scope: 'legacy-stock-state-and-receiving',
    item_count: itemRows.length,
    item_integrity: stableStockItems(itemRows),
    lot_count: lotRows.length,
    lot_integrity: stableLots(lotRows),
    manufacturer_barcode_non_null_count: nonNullManufacturerBarcodeCount,
    balances: stableBalances(balanceRows),
    transactions: stableTransactions(transactionRows),
    transaction_counts_by_type: transactionCountByType,
    movement_line_count: movementLines.length,
    movement_lines: stableMovementLines(movementLines),
    referential_integrity: {
      movement_lines_without_transaction_lot_location: movementLines.length - linkedMovementLineCount,
      orphan_lot_count: orphanLotCount,
      orphan_balance_count: orphanBalanceCount,
      unique_item_lot_violation_count: uniqueLotViolationCount,
    },
    feature_flags: {
      receiving_enabled: Boolean(latestPolicy?.is_enabled),
      expiry_exception_enabled: Boolean(latestPolicy?.expiry_exception_enabled),
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
  const mode = parseOptions()
  const context = releaseContext(mode)
  if (mode === '--compare') {
    const before = JSON.parse(fs.readFileSync(context.beforeFile, 'utf8'))
    const after = JSON.parse(fs.readFileSync(context.afterFile, 'utf8'))
    if (before.release_context?.target !== after.release_context?.target) fail('Reconciliation refused: before and after target contexts differ.')
    if (before.release_context?.backup_reference !== after.release_context?.backup_reference) fail('Reconciliation refused: before and after backup references differ.')
    if (before.release_context?.read_only !== true || after.release_context?.read_only !== true) fail('Reconciliation refused: snapshots must be read-only captures.')
    if (context.target === 'production' && before.release_context?.target !== 'production') fail('Production compare requires production snapshots.')
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

  if (!context.file) fail('Snapshot mode requires --file <path>.')
  const snapshot = await captureSnapshot(context)
  fs.writeFileSync(context.file, `${JSON.stringify(snapshot, null, 2)}\n`)
  outputJson(snapshot)
  console.error(`${mode.slice(2)} snapshot captured at ${context.file}; SELECT-only.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
