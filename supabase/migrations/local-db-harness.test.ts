import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('local Supabase database test harness compatibility', () => {
  it('excludes analytics services using current Supabase CLI service names', () => {
    const script = readFileSync(join(root, 'scripts/db-test.mjs'), 'utf8')
    expect(script).toContain("runNpx(['supabase', 'start', '--exclude', 'logflare', '--exclude', 'vector'])")
  })

  it('uses the current local SMTP config section', () => {
    const config = readFileSync(join(root, 'supabase/config.toml'), 'utf8')
    expect(config).toContain('[local_smtp]')
    expect(config).not.toContain('[inbucket]')
  })
})
