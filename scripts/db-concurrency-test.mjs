import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(projectRoot, 'supabase', 'config.toml')
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'
const config = fs.readFileSync(configPath, 'utf8')
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
if (!projectId) throw new Error('supabase/config.toml does not contain project_id')
const container = `supabase_db_${projectId}`
const actor = '00000000-0000-0000-0000-000000000001'
const vendor = '90000000-0000-0000-0000-000000000001'
const location = '20000000-0000-0000-0000-000000000001'
const itemOne = '30000000-0000-0000-0000-000000000001'
const itemTwo = '30000000-0000-0000-0000-000000000002'

function outputOf(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

const psqlArgs = (stopOnError) => [
  'exec', '-i', container, 'psql',
  '-v', `ON_ERROR_STOP=${stopOnError ? '1' : '0'}`,
  '-U', 'postgres', '-d', 'postgres', '-X', '-f', '-',
]

function runPsql(sql, label, stopOnError = true) {
  const result = spawnSync(dockerCommand, psqlArgs(stopOnError), {
    cwd: projectRoot,
    input: sql,
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = outputOf(result)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}\n${output}`)
  return output
}

function startPsql(sql, label, stopOnError = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerCommand, psqlArgs(stopOnError), {
      cwd: projectRoot,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
      if (!settled) reject(new Error(`${label} timed out after 20 seconds`))
    }, 20_000)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      resolve({ label, status: status ?? 1, output: `${stdout}${stderr}` })
    })
    child.stdin.end(sql)
  })
}

async function startConcurrent(scripts, { stopOnError = true, staggerMs = 0 } = {}) {
  const first = startPsql(scripts[0], 'concurrent session 1', stopOnError)
  if (staggerMs) await new Promise((resolve) => setTimeout(resolve, staggerMs))
  const rest = scripts.slice(1).map((sql, index) => startPsql(sql, `concurrent session ${index + 2}`, stopOnError))
  return Promise.all([first, ...rest])
}

function assertSuccess(results, label) {
  const output = results.map((result) => result.output).join('\n')
  if (results.some((result) => result.status !== 0)) {
    throw new Error(`${label} did not complete successfully\n${output}`)
  }
  if (/deadlock detected|duplicate key|unique constraint|23505/i.test(output)) {
    throw new Error(`${label} surfaced an unexpected concurrency error\n${output}`)
  }
  return output
}

function receipt(id, no) {
  return `insert into public.bm_receipts (id, receipt_no, vendor_id, received_date, received_by, created_by) values ('${id}', '${no}', '${vendor}', '2026-09-18', '${actor}', '${actor}');`
}

function line(id, receiptId, lineNo, itemId, lotNumber, expiry, quantity, stockLotId = null) {
  return `insert into public.bm_receipt_lines (id, receipt_id, line_no, stock_item_id, stock_lot_id, lot_number, expiry_date, lot_mode, location_id, received_qty, tor_expiry_compliance) values ('${id}', '${receiptId}', ${lineNo}, '${itemId}', ${stockLotId ? `'${stockLotId}'` : 'null'}, '${lotNumber}', '${expiry}', '${stockLotId ? 'existing' : 'new'}', '${location}', ${quantity}, 'compliant');`
}

function confirmSession(receiptId, preConfirmSleep = 0.25) {
  return `begin;
set local statement_timeout = '10000';
select pg_sleep(${preConfirmSleep});
select public.confirm_bm_receipt('${receiptId}', '${actor}');
commit;`
}

function setupSql() {
  return `
update public.bm_receiving_policies
set is_enabled = true, expiry_exception_enabled = false
where version = (select max(version) from public.bm_receiving_policies);

${receipt('73000000-0000-0000-0000-000000000012', 'L0-12-A')}
${receipt('73000000-0000-0000-0000-000000000013', 'L0-12-B')}
${line('74000000-0000-0000-0000-000000000012', '73000000-0000-0000-0000-000000000012', 1, itemOne, 'HARNESS-LOT-001', '2028-12-31', 1, '40000000-0000-0000-0000-000000000001')}
${line('74000000-0000-0000-0000-000000000013', '73000000-0000-0000-0000-000000000012', 2, itemTwo, 'HARNESS-LOT-002', '2029-12-31', 1, '40000000-0000-0000-0000-000000000002')}
${line('74000000-0000-0000-0000-000000000014', '73000000-0000-0000-0000-000000000013', 1, itemTwo, 'HARNESS-LOT-002', '2029-12-31', 2, '40000000-0000-0000-0000-000000000002')}
${line('74000000-0000-0000-0000-000000000015', '73000000-0000-0000-0000-000000000013', 2, itemOne, 'HARNESS-LOT-001', '2028-12-31', 2, '40000000-0000-0000-0000-000000000001')}

${receipt('76000000-0000-0000-0000-000000000016', 'L0-16-A')}
${receipt('76000000-0000-0000-0000-000000000017', 'L0-16-B')}
${line('77000000-0000-0000-0000-000000000016', '76000000-0000-0000-0000-000000000016', 1, itemOne, 'L0-16-MATCHING', '2028-12-31', 5)}
${line('77000000-0000-0000-0000-000000000017', '76000000-0000-0000-0000-000000000017', 1, itemOne, 'L0-16-MATCHING', '2028-12-31', 3)}

${receipt('78000000-0000-0000-0000-000000000017', 'L0-17-A-FIRST')}
${receipt('78000000-0000-0000-0000-000000000018', 'L0-17-A-SECOND')}
${line('79000000-0000-0000-0000-000000000017', '78000000-0000-0000-0000-000000000017', 1, itemOne, 'L0-17-A-FIRST', '2028-12-31', 5)}
${line('79000000-0000-0000-0000-000000000018', '78000000-0000-0000-0000-000000000018', 1, itemOne, 'L0-17-A-FIRST', '2029-01-31', 3)}

${receipt('78000000-0000-0000-0000-000000000019', 'L0-17-B-FIRST')}
${receipt('78000000-0000-0000-0000-000000000020', 'L0-17-B-SECOND')}
${line('79000000-0000-0000-0000-000000000019', '78000000-0000-0000-0000-000000000019', 1, itemOne, 'L0-17-B-FIRST', '2029-01-31', 5)}
${line('79000000-0000-0000-0000-000000000020', '78000000-0000-0000-0000-000000000020', 1, itemOne, 'L0-17-B-FIRST', '2028-12-31', 3)}
`
}

function assertL0_12() {
  runPsql(`
do $$
declare
  v_a uuid;
  v_b uuid;
begin
  select stock_transaction_id into v_a from public.bm_receipts where id = '73000000-0000-0000-0000-000000000012';
  select stock_transaction_id into v_b from public.bm_receipts where id = '73000000-0000-0000-0000-000000000013';
  if (v_a is null or v_b is null) then raise exception 'L0-12: a receipt did not confirm'; end if;
  if (select count(*) from public.bm_stock_movement_lines where transaction_id in (v_a, v_b)) <> 4 then
    raise exception 'L0-12: expected four movement lines';
  end if;
  if (select sum(quantity) from public.bm_stock_movement_lines where transaction_id in (v_a, v_b) and lot_id = '40000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'L0-12: lot one delta is not 3';
  end if;
  if (select sum(quantity) from public.bm_stock_movement_lines where transaction_id in (v_a, v_b) and lot_id = '40000000-0000-0000-0000-000000000002') <> 3 then
    raise exception 'L0-12: lot two delta is not 3';
  end if;
end;
$$;
`, 'L0-12 assertion')
  console.log('L0-12 PASS: two interleaved sessions confirmed overlapping existing lots without deadlock.')
}

function assertL0_16() {
  runPsql(`
do $$
declare
  v_a uuid;
  v_b uuid;
  v_lot uuid;
begin
  select id into v_lot from public.bm_stock_lots where item_id = '${itemOne}' and lot_number = 'L0-16-MATCHING';
  if v_lot is null or (select count(*) from public.bm_stock_lots where item_id = '${itemOne}' and lot_number = 'L0-16-MATCHING') <> 1 then
    raise exception 'L0-16: expected exactly one resolved lot';
  end if;
  select stock_transaction_id into v_a from public.bm_receipts where id = '76000000-0000-0000-0000-000000000016';
  select stock_transaction_id into v_b from public.bm_receipts where id = '76000000-0000-0000-0000-000000000017';
  if v_a is null or v_b is null then raise exception 'L0-16: both receipts must be confirmed'; end if;
  if (select count(*) from public.bm_receipt_lines where receipt_id in ('76000000-0000-0000-0000-000000000016', '76000000-0000-0000-0000-000000000017') and stock_lot_id = v_lot) <> 2 then
    raise exception 'L0-16: both receipt lines did not resolve to one lot';
  end if;
  if (select count(*) from public.bm_stock_transactions where id in (v_a, v_b)) <> 2 then
    raise exception 'L0-16: expected two transactions';
  end if;
  if (select on_hand from public.bm_stock_lot_location_balances where lot_id = v_lot and location_id = '${location}') <> 8 then
    raise exception 'L0-16: final balance is not 8';
  end if;
end;
$$;
`, 'L0-16 assertion')
  console.log('L0-16 PASS: two interleaved sessions resolved one new lot and summed the balance to 8.')
}

function assertL0_17(receiptA, receiptB, lotNumber, expectedExpiry) {
  runPsql(`
do $$
declare
  v_confirmed integer;
  v_draft integer;
  v_lot uuid;
  v_expiry date;
  v_tx_count integer;
  v_line_count integer;
begin
  select count(*) filter (where status = 'confirmed'), count(*) filter (where status = 'draft')
    into v_confirmed, v_draft
  from public.bm_receipts where id in ('${receiptA}', '${receiptB}');
  if v_confirmed <> 1 or v_draft <> 1 then
    raise exception 'L0-17: expected one confirmed and one draft, got %/%', v_confirmed, v_draft;
  end if;
  select id, expiry_date into v_lot, v_expiry
  from public.bm_stock_lots where item_id = '${itemOne}' and lot_number = '${lotNumber}';
  if v_lot is null or (select count(*) from public.bm_stock_lots where item_id = '${itemOne}' and lot_number = '${lotNumber}') <> 1 then
    raise exception 'L0-17: expected one surviving lot';
  end if;
  if v_expiry <> '${expectedExpiry}' then raise exception 'L0-17: winning expiry changed to %', v_expiry; end if;
  select count(*) into v_tx_count
  from public.bm_stock_transactions as transaction_row
  where transaction_row.id in (select stock_transaction_id from public.bm_receipts where id in ('${receiptA}', '${receiptB}'));
  select count(*) into v_line_count
  from public.bm_stock_movement_lines as movement
  join public.bm_stock_transactions as transaction_row on transaction_row.id = movement.transaction_id
  where transaction_row.id in (select stock_transaction_id from public.bm_receipts where id in ('${receiptA}', '${receiptB}'));
  if v_tx_count <> 1 or v_line_count <> 1 then raise exception 'L0-17: losing transaction was not fully rolled back: %/%', v_tx_count, v_line_count; end if;
  if (select on_hand from public.bm_stock_lot_location_balances where lot_id = v_lot and location_id = '${location}') <> 5 then
    raise exception 'L0-17: final balance is not 5';
  end if;
end;
$$;
`, 'L0-17 assertion')
}

async function main() {
  runPsql(setupSql(), 'concurrency fixture setup')

  const existingResults = await startConcurrent([
    confirmSession('73000000-0000-0000-0000-000000000012'),
    confirmSession('73000000-0000-0000-0000-000000000013'),
  ])
  assertSuccess(existingResults, 'L0-12')
  assertL0_12()

  const matchingResults = await startConcurrent([
    confirmSession('76000000-0000-0000-0000-000000000016'),
    confirmSession('76000000-0000-0000-0000-000000000017'),
  ])
  assertSuccess(matchingResults, 'L0-16')
  assertL0_16()

  const aFirstResults = await startConcurrent([
    confirmSession('78000000-0000-0000-0000-000000000017', 0.1),
    confirmSession('78000000-0000-0000-0000-000000000018', 0.4),
  ], { stopOnError: false, staggerMs: 50 })
  const aFirstOutput = aFirstResults.map((result) => result.output).join('\n')
  if (!/Existing lot expiry date does not match/i.test(aFirstOutput)) throw new Error(`L0-17 A-first did not surface the expected mismatch\n${aFirstOutput}`)
  if (/23505|duplicate key|unique constraint/i.test(aFirstOutput)) throw new Error(`L0-17 A-first surfaced a raw unique violation\n${aFirstOutput}`)
  assertL0_17('78000000-0000-0000-0000-000000000017', '78000000-0000-0000-0000-000000000018', 'L0-17-A-FIRST', '2028-12-31')

  const bFirstResults = await startConcurrent([
    confirmSession('78000000-0000-0000-0000-000000000019', 0.1),
    confirmSession('78000000-0000-0000-0000-000000000020', 0.4),
  ], { stopOnError: false, staggerMs: 50 })
  const bFirstOutput = bFirstResults.map((result) => result.output).join('\n')
  if (!/Existing lot expiry date does not match/i.test(bFirstOutput)) throw new Error(`L0-17 B-first did not surface the expected mismatch\n${bFirstOutput}`)
  if (/23505|duplicate key|unique constraint/i.test(bFirstOutput)) throw new Error(`L0-17 B-first surfaced a raw unique violation\n${bFirstOutput}`)
  assertL0_17('78000000-0000-0000-0000-000000000019', '78000000-0000-0000-0000-000000000020', 'L0-17-B-FIRST', '2029-01-31')
  console.log('L0-17 PASS: both concurrent expiry-order cases left one confirmed winner, one draft loser, and no duplicate lot.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
