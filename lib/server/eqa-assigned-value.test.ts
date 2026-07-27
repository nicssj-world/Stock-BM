import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const eqaSource = readFileSync(join(process.cwd(), 'lib/server/eqa.ts'), 'utf8')
const postRoute = readFileSync(join(process.cwd(), 'app/api/eqa/results/route.ts'), 'utf8')
const patchRoute = readFileSync(join(process.cwd(), 'app/api/eqa/results/[id]/route.ts'), 'utf8')
const migration = readFileSync(join(process.cwd(), 'supabase/migrations/202607280001_eqa_assigned_value_text.sql'), 'utf8')

describe('EQA provider assigned values', () => {
  it('accepts qualitative as well as numeric references and preserves prior numeric data', () => {
    expect(postRoute).toContain('assignedValue: z.string().trim().max(120).nullable().optional()')
    expect(patchRoute).toContain('assignedValue: z.string().trim().max(120).nullable().optional()')
    expect(eqaSource).toContain('assigned_value: clean(input.assignedValue)')
    expect(migration).toContain('alter column assigned_value type text using assigned_value::text')
  })
})
