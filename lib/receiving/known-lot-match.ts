export type KnownLotMatchItem = {
  lotId: string
  itemId: string
  lotNumber: string
  expiryDate?: string | null
  itemCode?: string | null
}

export type KnownLotCandidate = KnownLotMatchItem & {
  lotNumberNormalized: string
  score?: number
}

export type KnownLotMatch =
  | { kind: 'exact_unique'; lotId: string; candidate: KnownLotCandidate }
  | { kind: 'exact_ambiguous'; lotIds: string[]; candidates: KnownLotCandidate[] }
  | { kind: 'similar'; candidates: KnownLotCandidate[] }
  | { kind: 'none' }

export function normalizeLot(value: string | null | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function textSignals(text: string) {
  const lines = text.split(/\r?\n/).map(normalizeLot).filter(Boolean)
  const tokens = text.split(/\s+/).map(normalizeLot).filter(Boolean)
  const signals = new Set<string>([normalizeLot(text), ...lines, ...tokens])
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

function candidate(item: KnownLotMatchItem, lotNumberNormalized: string, score?: number): KnownLotCandidate {
  return { ...item, lotNumberNormalized, ...(score === undefined ? {} : { score }) }
}

function compareCandidate(left: KnownLotCandidate, right: KnownLotCandidate) {
  return (right.score ?? 1) - (left.score ?? 1) || left.lotId.localeCompare(right.lotId)
}

export function matchKnownLots(ocrText: string, lots: KnownLotMatchItem[]): KnownLotMatch {
  const signals = textSignals(ocrText)
  const prepared = lots
    .map((lot) => ({ lot, normalized: normalizeLot(lot.lotNumber) }))
    .filter(({ normalized }) => normalized.length > 0)
  const exact = prepared
    .filter(({ normalized }) => signals.includes(normalized))
    .map(({ lot, normalized }) => candidate(lot, normalized))
    .sort((left, right) => left.lotId.localeCompare(right.lotId))

  if (exact.length === 1) return { kind: 'exact_unique', lotId: exact[0].lotId, candidate: exact[0] }
  if (exact.length > 1) return { kind: 'exact_ambiguous', lotIds: exact.map((lot) => lot.lotId), candidates: exact }

  const similaritySignals = signals.filter((signal) => !prepared.some(({ normalized }) => signal.length > normalized.length && signal.includes(normalized)))
  const similar = prepared
    .map(({ lot, normalized }) => {
      const scores = similaritySignals
        .filter((signal) => signal.length >= 3 && !signal.includes(normalized) && !normalized.includes(signal))
        .map((signal) => similarity(normalized, signal))
      const score = scores.length ? Math.max(...scores) : 0
      return { lot, normalized, score }
    })
    .filter(({ normalized, score }) => normalized.length >= 3 && score >= 0.75)
    .map(({ lot, normalized, score }) => candidate(lot, normalized, score))
    .sort(compareCandidate)

  return similar.length ? { kind: 'similar', candidates: similar } : { kind: 'none' }
}
