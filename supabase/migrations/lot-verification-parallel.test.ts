import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202608120001_lot_verification_parallel.sql'), 'utf8')

describe('lot verification parallel migration', () => {
  it('keeps the parallel limit nullable for non-parallel verification methods', () => {
    expect(sql).toContain('parallel_limit numeric default 1 check (parallel_limit is null or parallel_limit > 0)')
  })
})
