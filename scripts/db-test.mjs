import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(scriptPath), '..')
const configPath = path.join(projectRoot, 'supabase', 'config.toml')
const fixtureDirectory = path.join(projectRoot, 'supabase', 'tests', 'fixtures')
const testDirectory = path.join(projectRoot, 'supabase', 'tests')
const externalDependenciesPath = path.join(fixtureDirectory, '000-external-deps.sql')
const seedPath = path.join(fixtureDirectory, '001-seed.sql')
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'

function outputOf(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

function printTail(output, limit = 18) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length) console.log(lines.slice(-limit).join('\n'))
}

function runNpx(args, { allowFailure = false } = {}) {
  const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : npxCommand
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [npxCommand, '--no-install', ...args].join(' ')]
    : ['--no-install', ...args]
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  const output = outputOf(result)
  if (result.error) throw result.error
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${args.join(' ')} failed with exit code ${result.status}\n${output}`)
  }
  return { status: result.status ?? 1, output }
}

function runSql(sql, label) {
  const config = fs.readFileSync(configPath, 'utf8')
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
  if (!projectId) throw new Error('supabase/config.toml does not contain project_id')

  const result = spawnSync(
    dockerCommand,
    [
      'exec',
      '-i',
      `supabase_db_${projectId}`,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-f',
      '-',
    ],
    {
      cwd: projectRoot,
      input: sql,
      encoding: 'utf8',
      windowsHide: true,
    },
  )
  const output = outputOf(result)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}\n${output}`)
  printTail(output)
  return output
}

function setMigrationsEnabled(config, enabled) {
  const pattern = /(\[db\.migrations\][\s\S]*?^enabled\s*=\s*)(true|false)/m
  const match = config.match(pattern)
  if (!match) throw new Error('Could not locate [db.migrations].enabled in supabase/config.toml')
  if ((match[2] === 'true') === enabled) return config
  const updated = config.replace(
    pattern,
    `$1${enabled ? 'true' : 'false'}`,
  )
  return updated
}

function sqlFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

const originalConfig = fs.readFileSync(configPath, 'utf8')
let started = false

try {
  if (!fs.existsSync(externalDependenciesPath)) throw new Error('Missing external dependency fixture')
  if (!fs.existsSync(seedPath)) throw new Error('Missing deterministic seed fixture')

  runNpx(['supabase', 'stop', '--no-backup'], { allowFailure: true })

  // Supabase start applies migrations eagerly. Temporarily disable that step so
  // the shared-project stand-ins can be loaded before the first repository SQL.
  fs.writeFileSync(configPath, setMigrationsEnabled(originalConfig, false))
  runNpx(['supabase', 'start', '--exclude', 'analytics'])
  started = true

  fs.writeFileSync(configPath, setMigrationsEnabled(originalConfig, true))
  runSql(sqlFile(externalDependenciesPath), 'external dependency bootstrap')

  const firstMigrationRun = runNpx(['supabase', 'migration', 'up', '--local'], { allowFailure: true })
  if (firstMigrationRun.status !== 0) {
    const expectedDataPrecondition = 'CD4 normalization requires exactly one active CD4 control-plan instrument'
    if (!firstMigrationRun.output.includes(expectedDataPrecondition)) {
      throw new Error(`initial migration run failed unexpectedly\n${firstMigrationRun.output}`)
    }
    console.log('Expected existing-migration data precondition reached; loading deterministic seed and resuming.')
    runSql(sqlFile(seedPath), 'deterministic seed')
    const resumedMigrationRun = runNpx(['supabase', 'migration', 'up', '--local'], { allowFailure: true })
    if (resumedMigrationRun.status !== 0) throw new Error(`resumed migration run failed\n${resumedMigrationRun.output}`)
    printTail(resumedMigrationRun.output)
  } else {
    printTail(firstMigrationRun.output)
    runSql(sqlFile(seedPath), 'deterministic seed')
  }

  const migrationHistory = runSql(
    "select count(*)::integer as applied_migrations from supabase_migrations.schema_migrations;",
    'migration history assertion',
  )
  if (!/\bapplied_migrations\b/i.test(migrationHistory)) {
    throw new Error('L0-1 did not return migration history')
  }
  console.log('L0-1 PASS: full repository migration set applied to clean local Postgres.')

  const sqlTests = fs
    .readdirSync(testDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const name of sqlTests) {
    const output = runSql(sqlFile(path.join(testDirectory, name)), name)
    console.log(`${name} PASS`)
    if (!output.includes('PASS')) throw new Error(`${name} did not emit a PASS marker`)
  }

  console.log('Real-DB verification complete.')
} finally {
  fs.writeFileSync(configPath, originalConfig)
  if (started) {
    const stop = runNpx(['supabase', 'stop', '--no-backup'], { allowFailure: true })
    if (stop.status !== 0) printTail(stop.output)
  }
}
