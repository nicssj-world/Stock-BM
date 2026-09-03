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

  it('limits follow-up updates to the right users', () => {
    expect(service).toContain('updateMorningTalkChecklistItem')
    expect(service).toContain('Only assigned attendees can update the checklist')
    expect(service).toContain('Only the action owner or Admin can update this action item')
    expect(service).toContain("'morning-talk.action.update'")
  })
})
