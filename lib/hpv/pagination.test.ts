import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { collectHpvSamplePages } from './pagination'

describe('HPV sample pagination', () => {
  it('loads 1,565 samples across bounded pages without losing older boxes', async () => {
    const rows = Array.from({ length: 1565 }, (_, id) => ({ id: String(id), barcode: String(id) }))
    const fetchPage = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1))

    const result = await collectHpvSamplePages(rows.length, fetchPage)

    expect(result).toEqual(rows)
    expect(fetchPage.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1564]])
  })

  it('handles zero rows and an exact page boundary', async () => {
    const fetchPage = vi.fn(async (_from: number, _to: number) => [] as { id: number }[])
    expect(await collectHpvSamplePages(0, fetchPage)).toEqual([])
    expect(fetchPage).not.toHaveBeenCalled()

    const rows = Array.from({ length: 1000 }, (_, id) => ({ id }))
    const bounded = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1))
    expect(await collectHpvSamplePages(rows.length, bounded)).toEqual(rows)
    expect(bounded).toHaveBeenCalledTimes(2)
  })

  it('fails closed when Supabase truncates a response', async () => {
    const page = Array.from({ length: 100 }, (_, id) => ({ id }))
    await expect(collectHpvSamplePages(1200, async () => page)).rejects.toThrow('Incomplete HPV samples')
  })

  it('fails closed on duplicate offsets, rather than showing false empty boxes', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 4 }]
    await expect(collectHpvSamplePages(4, async (from, to) => rows.slice(from, to + 1), 2)).rejects.toThrow('Duplicate or missing')
  })

  it('rejects unsafe page sizes', async () => {
    await expect(collectHpvSamplePages(10, async () => [], 1001)).rejects.toThrow('page size')
  })
})

describe('HPV inventory integration contracts', () => {
  const serverSource = readFileSync(join(process.cwd(), 'lib/server/hpv.ts'), 'utf8')
  const viewSource = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

  it('counts rows and paginates by a stable ordering instead of using a 2,500-row query', () => {
    expect(serverSource).toContain("collectHpvSamplePages(count, async (from, to) =>")
    expect(serverSource).toContain(".order('id', { ascending: false })")
    expect(serverSource).toContain('.range(from, to)')
    expect(serverSource).not.toContain(".limit(2500)")
  })

  it('excludes destroyed boxes from active stored and destroy-due counters', () => {
    expect(viewSource).toContain("data.boxes.filter((box) => box.status !== 'destroyed').flatMap")
    expect(viewSource).toContain("getHpvDestructionState(box.destroyDueAt, box.status, today, box.filledAt) === 'due_now'")
    expect(serverSource).toContain("const activeBoxIds = boxes.filter((box) => box.status !== 'destroyed')")
  })

  it('counts direct checkout records and blocks checkout or undo against destroyed boxes', () => {
    expect(viewSource).toContain("data.externalSamples.filter((s) => s.status === 'checked_out').length")
    expect(serverSource).toContain("if (!box || box.status === 'destroyed')")
    expect(serverSource).toContain('ตัวอย่างอยู่ในกล่องที่ทำลายแล้ว ไม่สามารถ Checkout ได้')
  })
})
