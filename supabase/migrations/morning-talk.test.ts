import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202607240002_morning_talk.sql'), 'utf8')

describe('Morning Talk migration', () => {
  it('creates meetings and per-user acknowledgement records', () => {
    expect(sql).toContain('create table public.morning_talks')
    expect(sql).toContain('create table public.morning_talk_attendees')
    expect(sql).toContain('acknowledged_at timestamptz')
    expect(sql).toContain('primary key (talk_id, user_id)')
  })

  it('keeps records readable to active users and writable only by the server role', () => {
    expect(sql).toContain('using (public.current_bm_role() is not null)')
    expect(sql).toContain('grant select, insert, update, delete on public.morning_talks, public.morning_talk_attendees to service_role')
  })
})
