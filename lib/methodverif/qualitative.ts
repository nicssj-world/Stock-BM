// Qualitative method verification (CLSI EP12-A2). Pure and unit-tested.
// Agreement: each sample's category on the new method is compared with the
// reference method (overall % agreement with a Wilson 95% CI, plus positive and
// negative percent agreement on the positive/negative split).
// Reproducibility: each replicate must give the expected category. A replicate
// that was repeated keeps its first result; the criterion is judged on the final
// result (the retest when there is one) and the first-pass rate is always shown.

import type { Verdict } from '@/lib/methodverif/stats'

export type QualitativeClass = 'empty' | 'invalid' | 'negative' | 'positive'

const NEGATIVE = /^(neg(ative)?|not\s*detected|target\s*not\s*detected|nd|tnd|non[-\s]?reactive|nr|ไม่พบ(เชื้อ)?|ลบ)$/i
const INVALID = /(invalid|error|failed|ไม่ผ่าน|ไม่สามารถ)/i

export function normalizeCategory(raw: string | null | undefined) {
  return (raw ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

export function classifyQualitative(raw: string | null | undefined): QualitativeClass {
  const text = (raw ?? '').trim()
  if (!text) return 'empty'
  if (INVALID.test(text)) return 'invalid'
  if (NEGATIVE.test(text)) return 'negative'
  return 'positive'
}

/** Wilson score interval for a proportion, in percent. */
export function wilsonInterval(successes: number, n: number, z = 1.959964): { lower: number; upper: number } | null {
  if (n <= 0) return null
  const p = successes / n
  const denominator = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { lower: round(((centre - margin) / denominator) * 100), upper: round(((centre + margin) / denominator) * 100) }
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const percent = (part: number, whole: number) => (whole ? round((part / whole) * 100) : null)

// ---------- Agreement ----------

export interface QualitativePairInput {
  sampleLabel: string
  referenceResult: string
  candidateResult: string
}

export type QualitativePairCategory = 'agree' | 'disagree' | 'incomplete' | 'invalid'

export interface QualitativePair {
  sampleLabel: string
  reference: QualitativeClass
  candidate: QualitativeClass
  category: QualitativePairCategory
}

export interface QualitativeAgreementResult {
  pairs: QualitativePair[]
  n: number
  agree: number
  agreementPercent: number | null
  agreementCi: { lower: number; upper: number } | null
  referencePositive: number
  positiveAgree: number
  ppa: number | null
  referenceNegative: number
  negativeAgree: number
  npa: number | null
  invalidN: number
  incompleteN: number
  categories: { reference: string; candidate: string; agree: boolean; count: number }[]
  verdict: Verdict
  reasons: string[]
}

export function qualitativeAgreement(rows: QualitativePairInput[], criteria: { minSamples: number; minAgreementPercent: number }): QualitativeAgreementResult {
  // One pair per input row (blank rows included) so pairs[i] always matches rows[i].
  const pairs: QualitativePair[] = rows
    .map((row) => {
      const reference = classifyQualitative(row.referenceResult)
      const candidate = classifyQualitative(row.candidateResult)
      let category: QualitativePairCategory
      if (reference === 'empty' || candidate === 'empty') category = 'incomplete'
      else if (reference === 'invalid' || candidate === 'invalid') category = 'invalid'
      else category = normalizeCategory(row.referenceResult) === normalizeCategory(row.candidateResult) ? 'agree' : 'disagree'
      return { sampleLabel: row.sampleLabel, reference, candidate, category }
    })
  const scored = pairs.filter((pair) => pair.category === 'agree' || pair.category === 'disagree')
  const n = scored.length
  const agree = scored.filter((pair) => pair.category === 'agree').length
  const refPos = scored.filter((pair) => pair.reference === 'positive')
  const refNeg = scored.filter((pair) => pair.reference === 'negative')
  const positiveAgree = refPos.filter((pair) => pair.candidate === 'positive').length
  const negativeAgree = refNeg.filter((pair) => pair.candidate === 'negative').length

  const tally = new Map<string, QualitativeAgreementResult['categories'][number]>()
  rows.forEach((row, index) => {
    const pair = pairs[index]
    if (!pair || (pair.category !== 'agree' && pair.category !== 'disagree')) return
    const key = `${normalizeCategory(row.referenceResult)}|${normalizeCategory(row.candidateResult)}`
    const entry = tally.get(key) ?? { reference: row.referenceResult.trim(), candidate: row.candidateResult.trim(), agree: pair.category === 'agree', count: 0 }
    entry.count += 1
    tally.set(key, entry)
  })

  const agreementPercent = percent(agree, n)
  const reasons: string[] = []
  let verdict: Verdict = 'passed'
  if (n < criteria.minSamples) {
    verdict = 'insufficient'
    reasons.push(`มีตัวอย่างที่อ่านผลได้ ${n} ราย ต้องมีอย่างน้อย ${criteria.minSamples} ราย`)
  } else if (agreementPercent != null && agreementPercent < criteria.minAgreementPercent) {
    verdict = 'failed'
    reasons.push(`Agreement ${agree}/${n} (${agreementPercent}%) ต่ำกว่าเกณฑ์ ${criteria.minAgreementPercent}%`)
  }
  const invalidN = pairs.filter((pair) => pair.category === 'invalid').length
  const incompleteN = pairs.filter((pair, index) => pair.category === 'incomplete' && (rows[index].sampleLabel.trim() || rows[index].referenceResult.trim() || rows[index].candidateResult.trim())).length
  if (invalidN) reasons.push(`ผล invalid ${invalidN} ราย (ไม่นับ)`)
  if (incompleteN) reasons.push(`ผลไม่ครบ ${incompleteN} ราย (ไม่นับ)`)

  return {
    pairs,
    n,
    agree,
    agreementPercent,
    agreementCi: wilsonInterval(agree, n),
    referencePositive: refPos.length,
    positiveAgree,
    ppa: percent(positiveAgree, refPos.length),
    referenceNegative: refNeg.length,
    negativeAgree,
    npa: percent(negativeAgree, refNeg.length),
    invalidN,
    incompleteN,
    categories: [...tally.values()].sort((a, b) => b.count - a.count),
    verdict,
    reasons,
  }
}

// ---------- Reproducibility ----------

export interface ReproducibilityInput {
  sampleLabel: string
  replicateId: string
  run: string
  expected: string
  result: string
  retest: string
  note: string
}

export interface ReproducibilityRowResult {
  firstMatch: boolean | null
  finalMatch: boolean | null
  retested: boolean
}

export interface ReproducibilitySampleSummary {
  sampleLabel: string
  expected: string
  n: number
  firstMatch: number
  finalMatch: number
}

export interface ReproducibilityResult {
  rows: ReproducibilityRowResult[]
  samples: ReproducibilitySampleSummary[]
  n: number
  firstMatch: number
  firstPercent: number | null
  finalMatch: number
  finalPercent: number | null
  retestedN: number
  verdict: Verdict
  reasons: string[]
}

export function qualitativeReproducibility(rows: ReproducibilityInput[], minPercent: number): ReproducibilityResult {
  const results: ReproducibilityRowResult[] = rows.map((row) => {
    const expected = normalizeCategory(row.expected)
    const first = classifyQualitative(row.result)
    const retested = Boolean(row.retest.trim())
    const finalRaw = retested ? row.retest : row.result
    const finalClass = classifyQualitative(finalRaw)
    const usable = (value: QualitativeClass) => value !== 'empty' && value !== 'invalid'
    return {
      firstMatch: !expected || !usable(first) ? null : normalizeCategory(row.result) === expected,
      finalMatch: !expected || !usable(finalClass) ? null : normalizeCategory(finalRaw) === expected,
      retested,
    }
  })
  const scoredFirst = results.filter((row) => row.firstMatch != null)
  const scoredFinal = results.filter((row) => row.finalMatch != null)
  const firstMatch = scoredFirst.filter((row) => row.firstMatch).length
  const finalMatch = scoredFinal.filter((row) => row.finalMatch).length

  const bySample = new Map<string, ReproducibilitySampleSummary>()
  rows.forEach((row, index) => {
    const key = `${row.sampleLabel.trim()}|${normalizeCategory(row.expected)}`
    const entry = bySample.get(key) ?? { sampleLabel: row.sampleLabel.trim(), expected: row.expected.trim(), n: 0, firstMatch: 0, finalMatch: 0 }
    if (results[index].finalMatch == null) return
    entry.n += 1
    if (results[index].firstMatch) entry.firstMatch += 1
    if (results[index].finalMatch) entry.finalMatch += 1
    bySample.set(key, entry)
  })

  const finalPercent = percent(finalMatch, scoredFinal.length)
  const reasons: string[] = []
  let verdict: Verdict = 'passed'
  if (!scoredFinal.length) {
    verdict = 'insufficient'
    reasons.push('ยังไม่มีผล reproducibility')
  } else if (finalPercent != null && finalPercent < minPercent) {
    verdict = 'failed'
    reasons.push(`Reproducibility ${finalMatch}/${scoredFinal.length} (${finalPercent}%) ต่ำกว่าเกณฑ์ ${minPercent}%`)
  }
  const retestedN = results.filter((row) => row.retested).length
  if (retestedN) reasons.push(`รันซ้ำ ${retestedN} หลอด · ผลครั้งแรกตรง ${firstMatch}/${scoredFirst.length}`)
  return {
    rows: results,
    samples: [...bySample.values()].filter((sample) => sample.n > 0),
    n: scoredFinal.length,
    firstMatch,
    firstPercent: percent(firstMatch, scoredFirst.length),
    finalMatch,
    finalPercent,
    retestedN,
    verdict,
    reasons,
  }
}
