export type CatalogMatchItem = {
  itemId: string
  catalogNo?: string | null
  catalogNoNormalized?: string | null
  itemCode?: string | null
  name?: string | null
  manufacturer?: string | null
  vendor?: string | null
}

export type CatalogCandidate = CatalogMatchItem & {
  catalogNoNormalized: string
  score?: number
}

export type CatalogMatch =
  | { kind: 'exact_unique'; itemId: string; candidate: CatalogCandidate }
  | { kind: 'exact_ambiguous'; itemIds: string[]; candidates: CatalogCandidate[] }
  | { kind: 'similar'; candidates: CatalogCandidate[] }
  | { kind: 'none' }

export function normalizeCatalog(value: string | null | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function textSignals(text: string) {
  const lines = text.split(/\r?\n/).map(normalizeCatalog).filter(Boolean)
  const tokens = text.split(/\s+/).map(normalizeCatalog).filter(Boolean)
  const signals = new Set<string>([normalizeCatalog(text), ...lines, ...tokens])
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index + size <= tokens.length; index += 1) signals.add(tokens.slice(index, index + size).join(''))
  }
  return [...signals].filter(Boolean)
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      previous[column] = left[row - 1] === right[column - 1]
        ? diagonal
        : Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + 1)
      diagonal = above
    }
  }
  return previous[right.length]
}

function similarity(left: string, right: string) {
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length)
}

function candidate(item: CatalogMatchItem, catalogNoNormalized: string, score?: number): CatalogCandidate {
  return { ...item, catalogNoNormalized, ...(score === undefined ? {} : { score }) }
}

function compareCandidate(left: CatalogCandidate, right: CatalogCandidate) {
  return (right.score ?? 1) - (left.score ?? 1) || left.itemId.localeCompare(right.itemId)
}

export function matchCatalogs(ocrText: string, items: CatalogMatchItem[]): CatalogMatch {
  const signals = textSignals(ocrText)
  const prepared = items
    .map((item) => ({ item, normalized: item.catalogNoNormalized || normalizeCatalog(item.catalogNo) }))
    .filter(({ normalized }) => normalized.length > 0)
  const exact = prepared
    .filter(({ normalized }) => signals.includes(normalized))
    .map(({ item, normalized }) => candidate(item, normalized))
    .sort((left, right) => left.itemId.localeCompare(right.itemId))

  if (exact.length === 1) return { kind: 'exact_unique', itemId: exact[0].itemId, candidate: exact[0] }
  if (exact.length > 1) return { kind: 'exact_ambiguous', itemIds: exact.map((item) => item.itemId), candidates: exact }

  const similaritySignals = signals.filter((signal) => !prepared.some(({ normalized }) => signal.length > normalized.length && signal.includes(normalized)))
  const similar = prepared
    .map(({ item, normalized }) => {
      const scores = similaritySignals
        .filter((signal) => signal.length >= 3 && !signal.includes(normalized) && !normalized.includes(signal))
        .map((signal) => similarity(normalized, signal))
      const score = scores.length ? Math.max(...scores) : 0
      return { item, normalized, score }
    })
    .filter(({ normalized, score }) => normalized.length >= 3 && score >= 0.75)
    .map(({ item, normalized, score }) => candidate(item, normalized, score))
    .sort(compareCandidate)

  return similar.length ? { kind: 'similar', candidates: similar } : { kind: 'none' }
}
