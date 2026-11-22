// Instrument (method) comparison statistics — CLSI EP09 style, pure and unit-tested.
// Differences are candidate − reference in the analysis scale: log10 units for
// viral load, percent for linear assays.

export type CompareScale = 'linear' | 'log10'

export type ParsedResult =
  | { kind: 'empty' }
  | { kind: 'value'; value: number }
  | { kind: 'below'; limit: number | null }
  | { kind: 'above'; limit: number | null }
  | { kind: 'not-detected' }
  | { kind: 'invalid'; raw: string }

const NOT_DETECTED = /(not\s*detected|\bTND\b|\bND\b|negative|ไม่พบ|undetect)/i

function toNumber(text: string) {
  const cleaned = text.replace(/,/g, '').replace(/\s+/g, '').replace(/[a-zµ/]+$/i, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function parseResult(raw: string | null | undefined): ParsedResult {
  const text = (raw ?? '').trim()
  if (!text) return { kind: 'empty' }
  if (NOT_DETECTED.test(text)) return { kind: 'not-detected' }
  const bound = text.match(/^(?:target\s+detected\s*)?([<>])\s*=?\s*(.*)$/i)
  if (bound) {
    const limit = toNumber(bound[2])
    return bound[1] === '<' ? { kind: 'below', limit } : { kind: 'above', limit }
  }
  const value = toNumber(text)
  return value == null ? { kind: 'invalid', raw: text } : { kind: 'value', value }
}

export function isDetected(result: ParsedResult) {
  return result.kind === 'value' || result.kind === 'below' || result.kind === 'above'
}

export interface ComparePairInput {
  rowNo: number
  sampleLabel: string | null
  referenceRaw: string | null
  candidateRaw: string | null
}

export type PairCategory = 'quantitative' | 'both-not-detected' | 'detected-outside-range' | 'discordant' | 'incomplete' | 'invalid'

export interface ComparePair {
  rowNo: number
  sampleLabel: string | null
  reference: ParsedResult
  candidate: ParsedResult
  category: PairCategory
  referenceStat: number | null
  candidateStat: number | null
  mean: number | null
  difference: number | null
  withinPairLimit: boolean | null
}

export interface CompareCriteria {
  scale: CompareScale
  biasLimit: number
  pairLimit: number
  minPairs: number
}

export interface CompareSummary {
  totalRows: number
  quantitativeN: number
  meanBias: number | null
  sdDifference: number | null
  loaLower: number | null
  loaUpper: number | null
  maxAbsDifference: number | null
  withinPairLimitN: number
  withinPairLimitPercent: number | null
  slope: number | null
  intercept: number | null
  r: number | null
  bothDetectedN: number
  bothNotDetectedN: number
  discordantN: number
  concordancePercent: number | null
  invalidN: number
  incompleteN: number
  verdict: 'passed' | 'failed' | 'insufficient'
  reasons: string[]
}

export const PAIR_LIMIT_MIN_PERCENT = 95

function stat(value: number, scale: CompareScale) {
  return scale === 'log10' ? Math.log10(value) : value
}

function round(value: number | null, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function buildPair(input: ComparePairInput, criteria: CompareCriteria): ComparePair {
  const reference = parseResult(input.referenceRaw)
  const candidate = parseResult(input.candidateRaw)
  const base = { rowNo: input.rowNo, sampleLabel: input.sampleLabel, reference, candidate, referenceStat: null, candidateStat: null, mean: null, difference: null, withinPairLimit: null }
  if (reference.kind === 'invalid' || candidate.kind === 'invalid') return { ...base, category: 'invalid' }
  if (reference.kind === 'empty' || candidate.kind === 'empty') return { ...base, category: 'incomplete' }
  if (reference.kind === 'not-detected' && candidate.kind === 'not-detected') return { ...base, category: 'both-not-detected' }
  if (isDetected(reference) !== isDetected(candidate)) return { ...base, category: 'discordant' }
  if (reference.kind !== 'value' || candidate.kind !== 'value') return { ...base, category: 'detected-outside-range' }
  const usable = criteria.scale === 'linear' || (reference.value > 0 && candidate.value > 0)
  if (!usable || (criteria.scale === 'linear' && reference.value === 0)) return { ...base, category: 'invalid' }
  const referenceStat = stat(reference.value, criteria.scale)
  const candidateStat = stat(candidate.value, criteria.scale)
  const difference = criteria.scale === 'log10'
    ? candidateStat - referenceStat
    : ((candidate.value - reference.value) / reference.value) * 100
  return {
    ...base,
    category: 'quantitative',
    referenceStat,
    candidateStat,
    mean: (referenceStat + candidateStat) / 2,
    difference,
    withinPairLimit: Math.abs(difference) <= criteria.pairLimit + 1e-12,
  }
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function sampleSd(values: number[]) {
  if (values.length < 2) return null
  const m = mean(values) as number
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1))
}

function regression(xs: number[], ys: number[]) {
  if (xs.length < 2) return { slope: null, intercept: null, r: null }
  const mx = mean(xs) as number
  const my = mean(ys) as number
  let sxx = 0
  let syy = 0
  let sxy = 0
  xs.forEach((x, index) => {
    sxx += (x - mx) ** 2
    syy += (ys[index] - my) ** 2
    sxy += (x - mx) * (ys[index] - my)
  })
  if (sxx === 0) return { slope: null, intercept: null, r: null }
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r: syy === 0 ? null : sxy / Math.sqrt(sxx * syy) }
}

export function compareInstruments(rows: ComparePairInput[], criteria: CompareCriteria) {
  const pairs = rows.map((row) => buildPair(row, criteria))
  const quantitative = pairs.filter((pair) => pair.category === 'quantitative')
  const differences = quantitative.map((pair) => pair.difference as number)
  const meanBias = mean(differences)
  const sdDifference = sampleSd(differences)
  const withinPairLimitN = quantitative.filter((pair) => pair.withinPairLimit).length
  const fit = regression(quantitative.map((pair) => pair.referenceStat as number), quantitative.map((pair) => pair.candidateStat as number))
  const bothDetectedN = pairs.filter((pair) => pair.category === 'quantitative' || pair.category === 'detected-outside-range').length
  const bothNotDetectedN = pairs.filter((pair) => pair.category === 'both-not-detected').length
  const discordantN = pairs.filter((pair) => pair.category === 'discordant').length
  const qualitativeN = bothDetectedN + bothNotDetectedN + discordantN
  const withinPairLimitPercent = quantitative.length ? (withinPairLimitN / quantitative.length) * 100 : null

  const reasons: string[] = []
  let verdict: CompareSummary['verdict'] = 'passed'
  if (quantitative.length < criteria.minPairs) {
    verdict = 'insufficient'
    reasons.push(`มีคู่ผลเชิงปริมาณ ${quantitative.length} คู่ ต้องมีอย่างน้อย ${criteria.minPairs} คู่`)
  } else {
    if (meanBias != null && Math.abs(meanBias) > criteria.biasLimit) {
      verdict = 'failed'
      reasons.push(`Bias เฉลี่ย ${meanBias.toFixed(3)} เกินเกณฑ์ ±${criteria.biasLimit}`)
    }
    if (withinPairLimitPercent != null && withinPairLimitPercent < PAIR_LIMIT_MIN_PERCENT) {
      verdict = 'failed'
      reasons.push(`คู่ผลที่ต่างไม่เกิน ±${criteria.pairLimit} มี ${withinPairLimitPercent.toFixed(1)}% (ต้อง ≥ ${PAIR_LIMIT_MIN_PERCENT}%)`)
    }
    if (discordantN > 0) {
      verdict = 'failed'
      reasons.push(`ผล detected / not detected ไม่ตรงกัน ${discordantN} ราย`)
    }
  }

  const summary: CompareSummary = {
    totalRows: pairs.length,
    quantitativeN: quantitative.length,
    meanBias: round(meanBias),
    sdDifference: round(sdDifference),
    loaLower: meanBias != null && sdDifference != null ? round(meanBias - 1.96 * sdDifference) : null,
    loaUpper: meanBias != null && sdDifference != null ? round(meanBias + 1.96 * sdDifference) : null,
    maxAbsDifference: differences.length ? round(Math.max(...differences.map(Math.abs))) : null,
    withinPairLimitN,
    withinPairLimitPercent: round(withinPairLimitPercent, 1),
    slope: round(fit.slope),
    intercept: round(fit.intercept),
    r: round(fit.r),
    bothDetectedN,
    bothNotDetectedN,
    discordantN,
    concordancePercent: qualitativeN ? round(((bothDetectedN + bothNotDetectedN) / qualitativeN) * 100, 1) : null,
    invalidN: pairs.filter((pair) => pair.category === 'invalid').length,
    incompleteN: pairs.filter((pair) => pair.category === 'incomplete').length,
    verdict,
    reasons,
  }
  return { pairs, summary }
}

// Paste from Excel/cobas export: "sample<TAB>reference<TAB>candidate" per line.
// Two-column lines are read as reference/candidate without a sample label.
export function parsePastedPairs(text: string): Omit<ComparePairInput, 'rowNo'>[] {
  return text
    .split(/\r?\n/)
    // Tabs (Excel) or semicolons only: commas are thousands separators in "1,770,000".
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .filter((cells) => !/^(sample|ตัวอย่าง|id|hn)\b/i.test(cells[0] ?? ''))
    .map((cells) => cells.length >= 3
      ? { sampleLabel: cells[0] || null, referenceRaw: cells[1] || null, candidateRaw: cells[2] || null }
      : { sampleLabel: null, referenceRaw: cells[0] || null, candidateRaw: cells[1] || null })
}
