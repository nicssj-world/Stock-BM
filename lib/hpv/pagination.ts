/**
 * Read every HPV sample without relying on Supabase's configured max_rows.
 * A short page or duplicated id is an error, never an empty storage box.
 */
export async function collectHpvSamplePages<T extends Record<string, unknown>>(
  expectedCount: number,
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    throw new Error('Invalid HPV sample count')
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Invalid HPV sample page size')
  }

  const rows: T[] = []
  for (let from = 0; from < expectedCount; from += pageSize) {
    const expectedPageSize = Math.min(pageSize, expectedCount - from)
    const page = await fetchPage(from, from + expectedPageSize - 1)
    if (page.length !== expectedPageSize) {
      throw new Error(`Incomplete HPV samples: expected ${expectedPageSize} rows at offset ${from}, got ${page.length}`)
    }
    rows.push(...page)
  }

  if (new Set(rows.map((row) => row.id)).size !== expectedCount) {
    throw new Error('Duplicate or missing HPV samples across pages')
  }
  return rows
}
