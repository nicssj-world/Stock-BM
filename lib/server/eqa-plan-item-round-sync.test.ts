import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/eqa.ts'), 'utf8')
const updatePlanItem = source.match(/export async function updatePlanItem\([\s\S]*?\n\}/)?.[0] ?? ''

describe('EQA annual-plan item updates', () => {
  it('keeps every linked round on the plan item’s selected scheme', () => {
    expect(updatePlanItem).toContain(".from('eqa_rounds').select('id').eq('plan_item_id', id)")
    expect(updatePlanItem).toContain(".from('eqa_rounds').update({ scheme_id: input.schemeId, updated_at:")
    expect(updatePlanItem).toContain("invalidateDocument('round-receipt', asString(round.id))")
  })
})
