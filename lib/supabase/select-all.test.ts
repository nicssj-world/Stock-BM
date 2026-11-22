import { describe, expect, it } from 'vitest'
import { selectAll } from '@/lib/supabase/select-all'

function fakeTable(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }))
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    // Mimics PostgREST: the range is honoured but never returns more than max-rows.
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null }
  }
  return { page, calls }
}

describe('selectAll', () => {
  it('reads past the 1000-row cap', async () => {
    const { page, calls } = fakeTable(2350)
    const { data, error } = await selectAll(page)
    expect(error).toBeNull()
    expect(data).toHaveLength(2350)
    expect(data.at(-1)).toEqual({ id: 2349 })
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('makes one extra request when the total is an exact multiple of the page size', async () => {
    const { page, calls } = fakeTable(2000)
    const { data } = await selectAll(page)
    expect(data).toHaveLength(2000)
    expect(calls).toHaveLength(3)
  })

  it('returns the first error with the rows read so far', async () => {
    let call = 0
    const { data, error } = await selectAll(async () => {
      call += 1
      return call === 1 ? { data: Array.from({ length: 1000 }, () => ({})), error: null } : { data: null, error: { message: 'boom' } }
    })
    expect(error).toEqual({ message: 'boom' })
    expect(data).toHaveLength(1000)
  })
})
