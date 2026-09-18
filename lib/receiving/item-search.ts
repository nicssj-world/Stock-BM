// Item Master lookup for receiving. The user always chooses the Item; this
// module only ranks Item Master rows for a typed query. Catalog/REF is the
// primary identifier and GTIN never stands in for it.

export type ItemSearchRow = {
  id: string
  itemCode: string
  name: string
  unit: string
  catalogNo?: string | null
  manufacturer?: string | null
  supplier?: string | null
}

export function normalizeCatalog(value: string | null | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLocaleLowerCase('th-TH').replace(/\s+/g, ' ').trim()
}

/**
 * Ranks: exact Catalog/REF, Catalog/REF prefix, exact item code, then
 * substring matches in Catalog/REF, item code, name, manufacturer or supplier.
 * Every query token must appear somewhere in the row.
 */
export function searchItems<T extends ItemSearchRow>(items: T[], query: string, limit = 20): T[] {
  const trimmed = query.trim()
  if (!trimmed) return items.slice(0, limit)
  const catalogQuery = normalizeCatalog(trimmed)
  const tokens = normalizeText(trimmed).split(' ').filter(Boolean)

  const scored = items.flatMap((item) => {
    const catalog = normalizeCatalog(item.catalogNo)
    const code = normalizeCatalog(item.itemCode)
    const haystack = normalizeText([item.catalogNo, item.itemCode, item.name, item.manufacturer, item.supplier].filter(Boolean).join(' '))
    const compactHaystack = normalizeCatalog(haystack)
    const allTokens = tokens.every((token) => haystack.includes(token) || (normalizeCatalog(token) && compactHaystack.includes(normalizeCatalog(token))))
    if (!allTokens) return []
    let score = 1
    if (catalogQuery && catalog === catalogQuery) score = 100
    else if (catalogQuery && catalog.startsWith(catalogQuery)) score = 80
    else if (catalogQuery && code === catalogQuery) score = 70
    else if (catalogQuery && catalog.includes(catalogQuery)) score = 60
    else if (catalogQuery && code.includes(catalogQuery)) score = 40
    return [{ item, score }]
  })

  return scored
    .sort((left, right) => right.score - left.score || left.item.itemCode.localeCompare(right.item.itemCode))
    .slice(0, limit)
    .map(({ item }) => item)
}

export function itemLabel(item: Pick<ItemSearchRow, 'itemCode' | 'name' | 'catalogNo'>) {
  return `${item.catalogNo ? `REF ${item.catalogNo} · ` : ''}${item.itemCode} · ${item.name}`
}
