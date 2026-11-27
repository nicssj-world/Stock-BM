import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BmActor } from '@/lib/bm/types'

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ rpc, from }) }))
vi.mock('@/lib/server/audit', () => ({ writeAudit: vi.fn(), writeSystemAudit: vi.fn() }))

import { reorderCalendarTypeButtons } from '@/lib/server/calendar'

const actor = { id: 'admin', role: 'Admin' } as BmActor
const input = { calendarId: 'calendar', ids: ['b', 'a'], expectedIds: ['a', 'b'] }

describe('reorderCalendarTypeButtons', () => {
  beforeEach(() => { rpc.mockReset(); from.mockReset() })

  it('rejects staff before the database call', async () => {
    await expect(reorderCalendarTypeButtons(input, { ...actor, role: 'Staff' })).rejects.toMatchObject({ status: 403 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends both scoped lists and returns the refreshed button order', async () => {
    rpc.mockResolvedValue({ error: null })
    const typeQuery = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) }
    from.mockReturnValueOnce(typeQuery)
    from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    await expect(reorderCalendarTypeButtons(input, actor)).resolves.toEqual([])
    expect(rpc).toHaveBeenCalledWith('bm_reorder_calendar_type_buttons', { p_calendar_id: 'calendar', p_ids: ['b', 'a'], p_expected_ids: ['a', 'b'] })
    expect(typeQuery.order).toHaveBeenNthCalledWith(1, 'button_sort_order', { ascending: true, nullsFirst: false })
    expect(typeQuery.eq).toHaveBeenCalledWith('calendar_id', 'calendar')
  })

  it('rejects stale lists without refreshing or retrying', async () => {
    rpc.mockResolvedValue({ error: { code: '40001', message: 'changed' } })
    await expect(reorderCalendarTypeButtons(input, actor)).rejects.toMatchObject({ status: 409 })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects invalid lists', async () => {
    rpc.mockResolvedValue({ error: { code: '22023', message: 'invalid' } })
    await expect(reorderCalendarTypeButtons(input, actor)).rejects.toMatchObject({ status: 400 })
  })
})
