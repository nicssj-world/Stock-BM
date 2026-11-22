// PostgREST (and so Supabase) silently caps every select at the project's
// max-rows setting (1000 by default) — `.limit(5000)` does not lift it. Tables
// that grow with every run (IQC results, consumables, baseline candidates) must
// be read page by page or older rows vanish without an error.

export const SELECT_PAGE_SIZE = 1000

type PageResponse = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/**
 * Reads every row of a query by requesting consecutive ranges until a short page.
 * `page(from, to)` must return the query with a stable order (e.g. `.order('id')`)
 * and `.range(from, to)` applied, otherwise rows can repeat or be skipped between pages.
 * Resolves to the same `{ data, error }` shape as a single Supabase query.
 */
export async function selectAll<T = Record<string, unknown>>(
  page: (from: number, to: number) => PageResponse,
  pageSize = SELECT_PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < pageSize) return { data: rows, error: null }
  }
}
