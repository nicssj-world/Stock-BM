import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverSource = readFileSync(join(process.cwd(), 'lib/server/hpv.ts'), 'utf8')
const migrationSource = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260723120000_hpv_storage_two_month_retention.sql'),
  'utf8',
)

describe('HPV two-month retention enforcement', () => {
  it('sets the two-month deadline when a box is closed manually or becomes full', () => {
    expect(serverSource.match(/addTwoMonths\(/g)).toHaveLength(2)
  })

  it('rejects destruction before the two-month deadline on the server', () => {
    expect(serverSource).toContain("!== 'due_now'")
    expect(serverSource).toContain('บันทึกทำลายได้เมื่อกล่องเก็บครบ 2 เดือนแล้วเท่านั้น')
  })

  it('backfills active boxes from their original filled timestamp', () => {
    expect(migrationSource).toContain("timezone('Asia/Bangkok', filled_at) + interval '2 months'")
    expect(migrationSource).toContain("where status = 'full'")
    expect(migrationSource).toContain('and destroyed_at is null')
  })
})
