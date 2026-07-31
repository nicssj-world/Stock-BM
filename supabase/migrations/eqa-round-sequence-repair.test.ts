import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607310002_eqa_round_sequence_repair.sql'), 'utf8')

describe('EQA round sequence repair migration', () => {
  it('moves a received round into the occurrence matching its sample-received month', () => {
    expect(sql).toContain("target.planned_month = extract(month from actual.sample_received_date)::integer")
    expect(sql).toContain("actual.status <> 'scheduled'")
    expect(sql).toContain("placeholder.status = 'scheduled'")
  })

  it('releases the old sequence before swapping the scheduled placeholder into it', () => {
    expect(sql).toContain('set sequence_no = null')
    expect(sql).toContain('set sequence_no = repair.source_sequence_no')
    expect(sql).toContain('set sequence_no = repair.target_sequence_no')
  })
})
