import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BmActor } from '@/lib/bm/types'

const { from, writeAudit } = vi.hoisted(() => ({ from: vi.fn(), writeAudit: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from }) }))
vi.mock('@/lib/server/audit', () => ({ writeAudit, writeSystemAudit: vi.fn() }))

import { deleteCalendarType } from '@/lib/server/calendar'

const actor = { id: 'admin-id', role: 'Admin' } as BmActor
const id = 'type-id'
const calendarId = 'calendar-id'

function mockCurrent() {
  from.mockReturnValueOnce({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { calendar_id: calendarId, name: 'Test type' }, error: null }),
  })
}

function mockCount(count: number) {
  const eq = vi.fn().mockResolvedValue({ count, error: null })
  const select = vi.fn().mockReturnValue({ eq })
  from.mockReturnValueOnce({ select })
  return { select, eq }
}

function mockDelete(error: { code: string; message: string } | null = null) {
  const query = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: error ? null : { id }, error }),
  }
  from.mockReturnValueOnce(query)
  return query
}

describe('deleteCalendarType', () => {
  beforeEach(() => {
    from.mockReset()
    writeAudit.mockReset()
    writeAudit.mockResolvedValue(undefined)
  })

  it('rejects Staff before accessing the database', async () => {
    await expect(deleteCalendarType(id, { ...actor, role: 'Staff' })).rejects.toMatchObject({ status: 403 })
    expect(from).not.toHaveBeenCalled()
  })

  it('blocks deletion if any entry references the type, including deleted entries', async () => {
    mockCurrent()
    const count = mockCount(3)
    await expect(deleteCalendarType(id, actor)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('3 รายการ') })
    expect(count.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(count.eq).toHaveBeenCalledWith('type_id', id)
    expect(from).toHaveBeenCalledTimes(2)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it('deletes an unused type, audits it and returns refreshed types', async () => {
    mockCurrent()
    mockCount(0)
    const query = mockDelete()
    from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    await expect(deleteCalendarType(id, actor)).resolves.toEqual([])
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', id)
    expect(query.eq).toHaveBeenNthCalledWith(2, 'calendar_id', calendarId)
    expect(writeAudit).toHaveBeenCalledWith(actor, 'calendar.type_delete', 'calendar-type', id, { calendarId, name: 'Test type' })
  })

  it('reports a conflict if an entry was created between count and delete', async () => {
    mockCurrent()
    mockCount(0)
    mockDelete({ code: '23503', message: 'foreign key constraint' })
    mockCount(1)
    await expect(deleteCalendarType(id, actor)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('1 รายการ') })
    expect(writeAudit).not.toHaveBeenCalled()
  })
})
