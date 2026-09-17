import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationDirectory = join(process.cwd(), 'supabase/migrations')

function changedMigrationFiles() {
  if (!existsSync(join(process.cwd(), '.git'))) return []

  const committed = execFileSync('git', ['diff', '--name-only', 'main...HEAD', '--', 'supabase/migrations'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const workingTree = execFileSync('git', ['diff', '--name-only', '--', 'supabase/migrations'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'supabase/migrations'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  return [...new Set(`${committed}\n${workingTree}\n${untracked}`
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => file.endsWith('.sql')))]
    .map((file) => join(process.cwd(), file))
    .filter((file) => existsSync(file))
}

describe('upgrade migration safety boundary', () => {
  it('does not alter protected bm_stock objects in migrations added by this plan', () => {
    for (const file of changedMigrationFiles()) {
      const sql = readFileSync(file, 'utf8').toLowerCase()
      expect(sql, file).not.toMatch(/drop\s+index[\s\S]*bm_stock_/)
      expect(sql, file).not.toMatch(/drop\s+constraint[\s\S]*bm_stock_/)
      expect(sql, file).not.toMatch(/create\s+or\s+replace\s+function\s+public\.receive_bm_stock\s*\(/)
      expect(sql, file).not.toMatch(/create\s+or\s+replace\s+function\s+public\.receive_bm_stock_bundle\s*\(/)
    }
  })
})
