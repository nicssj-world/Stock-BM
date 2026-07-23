import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'lib/server/hiv-drt.ts'), 'utf8')

describe('HIV DRT server safeguards', () => {
  it('blocks assistants and audits deleted tube status', () => {
    expect(source).toContain("actor.role === 'Assistant'")
    expect(source).toContain("status: asString(row.status)")
    expect(source).not.toContain('ลบได้เฉพาะ tube ที่ยังไม่ Checkout')
  })

  it('frees the rack slot at checkout while retaining storage snapshots', () => {
    expect(source).toContain("status: 'checked_out'")
    expect(source).toContain('current_rack_id: null')
    expect(source).toContain('current_position: null')
    expect(source).toContain('stored_rack_code:')
  })

  it('frees the rack slot when a stored tube is recorded as destroyed', () => {
    expect(source).toContain("status: 'destroyed'")
    expect(source).toContain('current_rack_id: null')
    expect(source).toContain('current_position: null')
    expect(source).toContain('destroyed_at: destroyedAt')
    expect(source).toContain('destroyed_by: actor.id')
  })

  it('uses a persistent forward-only rack cursor for auto-fill', () => {
    expect(source).toContain("select('id,rack_code,next_position')")
    expect(source).toContain('nextHivDrtRackPosition(occupied, cursor)')
    expect(source).toContain('next_position: Math.min(HIV_DRT_RACK_CAPACITY + 1, position + 1)')
    expect(source).toContain('Math.max(Number(row.next_position) || 1, historicalMax + 1)')
    expect(source).toContain(".eq('current_rack_id', input.rackId)")
    expect(source).toContain(".eq('stored_rack_code', asString(rackRow.rack_code))")
  })

  it('defaults an empty checkout destination to LAB Rama', () => {
    expect(source).toContain("input.destination?.trim() || 'LAB Rama'")
  })

  it('audits every lifecycle transition and requires a reason to undo results', () => {
    expect(source).toContain("'hiv_drt.sample.store'")
    expect(source).toContain("'hiv_drt.sample.checkout'")
    expect(source).toContain("'hiv_drt.result.receive'")
    expect(source).toContain("'hiv_drt.result.undo'")
    expect(source).toContain("'hiv_drt.sample.destroy'")
    expect(source).toContain('reason: reason.trim()')
  })
})
