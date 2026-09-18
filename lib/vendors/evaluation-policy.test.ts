import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vendor scoring policy guard', () => {
  it('has no numeric weight literal in the vendor implementation directory', () => {
    const directory = join(process.cwd(), 'lib/vendors')
    const implementation = readdirSync(directory).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).map((name) => readFileSync(join(directory, name), 'utf8')).join('\n')
    expect(implementation).not.toMatch(/weights\s*[:=][^\n]*\d/i)
    expect(implementation).not.toMatch(/score_formulas\s*[:=][^\n]*\d/i)
  })
})
