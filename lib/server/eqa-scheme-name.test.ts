import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/eqa.ts'), 'utf8')
const updateScheme = source.match(/export async function updateScheme\([\s\S]*?\n\}/)?.[0] ?? ''

describe('EQA scheme name updates', () => {
  it('propagates a renamed scheme to every linked plan item and invalidates affected documents', () => {
    expect(updateScheme).toContain(".from('eqa_plan_items').select('id,plan_id').eq('scheme_id', id)")
    expect(updateScheme).toContain(".from('eqa_plan_items').update({ project_name: input.name.trim(), sample_set_name: input.name.trim(), updated_at:")
    expect(updateScheme).toContain(".eq('scheme_id', id)")
    expect(updateScheme).toContain("invalidateDocument('annual-plan', planId)")
    expect(updateScheme).toContain("invalidateDocument('annual-summary', asString(item.id))")
  })
})
