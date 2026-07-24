import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const service = readFileSync(join(process.cwd(), 'lib/server/morning-talk.ts'), 'utf8')

describe('Morning Talk server rules', () => {
  it('requires an Admin to create, edit, or delete a meeting', () => {
    expect(service).toContain('function assertAdmin(actor: BmActor)')
    expect(service).toContain('assertAdmin(actor)')
  })

  it('permits acknowledgement only by an assigned attendee', () => {
    expect(service).toContain(".eq('talk_id', id)")
    expect(service).toContain(".eq('user_id', actor.id)")
    expect(service).toContain('You are not assigned to this Morning Talk')
    expect(service).toContain("'morning-talk.acknowledge'")
  })
})
