import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607310001_eqa_plan_item_round_scheme_sync.sql'), 'utf8')

describe('EQA plan-item round scheme synchronization migration', () => {
  it('reconciles every linked round with its annual-plan item scheme', () => {
    expect(sql).toContain('update public.eqa_rounds as round')
    expect(sql).toContain('from public.eqa_plan_items as item')
    expect(sql).toContain('round.plan_item_id = item.id')
    expect(sql).toContain('round.scheme_id is distinct from item.scheme_id')
  })
})
