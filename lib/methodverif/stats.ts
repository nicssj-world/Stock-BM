// Method verification statistics (ISO 15189:2022 7.3.2). Pure and unit-tested.
// Precision follows CLSI EP15-A3 (one-way ANOVA, days × replicates), LoD follows
// the EP17-A2 detection-rate check, linearity follows EP06 (deviation of the
// mean measured value from the expected value at each level).
// For log10 assays (viral load) everything is computed on log10 values and claims
// are SDs in log10 units; for linear assays claims are CV% and deviations are %.

import { isDetected, parseResult, type CompareScale } from '@/lib/instcomp/compare'

export type Verdict = 'passed' | 'failed' | 'insufficient'

function toStat(raw: string, scale: CompareScale): number | null {
  const parsed = parseResult(raw)
  if (parsed.kind !== 'value') return null
  if (scale === 'log10') return parsed.value > 0 ? Math.log10(parsed.value) : null
  return parsed.value
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function round(value: number | null, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// Acklam's rational approximation of the standard normal quantile.
export function normalQuantile(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const low = 0.02425
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - low) return -normalQuantile(1 - p)
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

// Wilson–Hilferty approximation of the chi-square quantile (accurate to ~1% for df ≥ 3).
export function chiSquareQuantile(p: number, df: number) {
  const z = normalQuantile(p)
  const k = 2 / (9 * df)
  return df * (1 - k + z * Math.sqrt(k)) ** 3
}

// ---------- Precision (EP15-A3) ----------

export interface PrecisionLevelInput {
  label: string
  claimRepeatability: number | null
  claimWithinLab: number | null
  values: string[][] // [day][replicate]
}

export interface PrecisionLevelResult {
  label: string
  days: number
  replicates: number
  n: number
  mean: number | null
  repeatability: number | null
  withinLab: number | null
  repeatabilityCv: number | null
  withinLabCv: number | null
  repeatabilityDf: number | null
  withinLabDf: number | null
  repeatabilityLimit: number | null
  withinLabLimit: number | null
  verdict: Verdict
  reasons: string[]
}

export const EP15_MIN_DAYS = 5
export const EP15_MIN_REPLICATES = 3

// Claims are SDs (log10) for log assays and CV% for linear ones; convert to an SD.
function claimAsSd(claim: number | null, scale: CompareScale, grandMean: number) {
  if (claim == null || !(claim > 0)) return null
  return scale === 'log10' ? claim : (claim / 100) * Math.abs(grandMean)
}

export function precisionLevel(input: PrecisionLevelInput, scale: CompareScale, levelCount: number): PrecisionLevelResult {
  const days = input.values
    .map((row) => row.map((raw) => toStat(raw, scale)).filter((value): value is number => value != null))
    .filter((row) => row.length > 0)
  const replicates = days.length ? Math.min(...days.map((row) => row.length)) : 0
  // EP15 is a balanced design: use the same number of replicates from every day.
  const balanced = days.map((row) => row.slice(0, replicates))
  const k = balanced.length
  const all = balanced.flat()
  const n = all.length
  const empty: PrecisionLevelResult = {
    label: input.label, days: k, replicates, n, mean: round(mean(all)), repeatability: null, withinLab: null, repeatabilityCv: null, withinLabCv: null,
    repeatabilityDf: null, withinLabDf: null, repeatabilityLimit: null, withinLabLimit: null, verdict: 'insufficient', reasons: [],
  }
  if (k < 2 || replicates < 2) {
    return { ...empty, reasons: [`ต้องมีอย่างน้อย ${EP15_MIN_DAYS} วัน × ${EP15_MIN_REPLICATES} ซ้ำ (ตอนนี้ ${k} วัน × ${replicates} ซ้ำ)`] }
  }
  const grand = mean(all) as number
  const dayMeans = balanced.map((row) => mean(row) as number)
  const ssWithin = balanced.reduce((sum, row, index) => sum + row.reduce((inner, value) => inner + (value - dayMeans[index]) ** 2, 0), 0)
  const ssBetween = replicates * dayMeans.reduce((sum, value) => sum + (value - grand) ** 2, 0)
  const dfWithin = n - k
  const dfBetween = k - 1
  const msWithin = ssWithin / dfWithin
  const msBetween = ssBetween / dfBetween
  const sr = Math.sqrt(msWithin)
  const sbSquared = Math.max(0, (msBetween - msWithin) / replicates)
  const swl = Math.sqrt(sr ** 2 + sbSquared)
  const swlDf = msBetween > msWithin
    ? ((replicates - 1) * msWithin + msBetween) ** 2 / (((replicates - 1) * msWithin) ** 2 / dfWithin + msBetween ** 2 / dfBetween)
    : dfWithin
  const p = 1 - 0.05 / Math.max(1, levelCount)
  const claimR = claimAsSd(input.claimRepeatability, scale, grand)
  const claimWl = claimAsSd(input.claimWithinLab, scale, grand)
  const limitR = claimR == null ? null : claimR * Math.sqrt(chiSquareQuantile(p, dfWithin) / dfWithin)
  const limitWl = claimWl == null ? null : claimWl * Math.sqrt(chiSquareQuantile(p, swlDf) / swlDf)

  const reasons: string[] = []
  let verdict: Verdict = 'passed'
  if (k < EP15_MIN_DAYS || replicates < EP15_MIN_REPLICATES) {
    verdict = 'insufficient'
    reasons.push(`EP15 ต้องมีอย่างน้อย ${EP15_MIN_DAYS} วัน × ${EP15_MIN_REPLICATES} ซ้ำ (ตอนนี้ ${k} × ${replicates})`)
  }
  if (claimR == null && claimWl == null) {
    verdict = 'insufficient'
    reasons.push('ยังไม่ได้กรอกค่า claim ของผู้ผลิต')
  }
  const unit = scale === 'log10' ? ' log' : ''
  if (verdict !== 'insufficient') {
    if (limitR != null && sr > limitR) {
      verdict = 'failed'
      reasons.push(`Repeatability ${sr.toFixed(4)}${unit} เกิน upper verification limit ${limitR.toFixed(4)}${unit}`)
    }
    if (limitWl != null && swl > limitWl) {
      verdict = 'failed'
      reasons.push(`Within-lab ${swl.toFixed(4)}${unit} เกิน upper verification limit ${limitWl.toFixed(4)}${unit}`)
    }
  }
  const cv = (sd: number) => (scale === 'linear' && grand !== 0 ? (sd / Math.abs(grand)) * 100 : null)
  return {
    ...empty,
    mean: round(grand),
    repeatability: round(sr),
    withinLab: round(swl),
    repeatabilityCv: round(cv(sr), 2),
    withinLabCv: round(cv(swl), 2),
    repeatabilityDf: dfWithin,
    withinLabDf: round(swlDf, 1),
    repeatabilityLimit: round(limitR),
    withinLabLimit: round(limitWl),
    verdict,
    reasons,
  }
}

// ---------- Limit of detection (EP17-A2 verification) ----------

export interface LodInput {
  claimedLod: number | null
  minReplicates: number
  minDetectPercent: number
  values: string[]
}

export interface LodResult {
  n: number
  detected: number
  invalid: number
  detectPercent: number | null
  verdict: Verdict
  reasons: string[]
}

export function lodVerification(input: LodInput): LodResult {
  const parsed = input.values.map((raw) => parseResult(raw)).filter((result) => result.kind !== 'empty')
  const invalid = parsed.filter((result) => result.kind === 'invalid').length
  const valid = parsed.filter((result) => result.kind !== 'invalid')
  const detected = valid.filter(isDetected).length
  const n = valid.length
  const detectPercent = n ? (detected / n) * 100 : null
  const reasons: string[] = []
  let verdict: Verdict = 'passed'
  if (input.claimedLod == null) {
    verdict = 'insufficient'
    reasons.push('ยังไม่ได้กรอกค่า LoD ที่ผู้ผลิตอ้าง')
  }
  if (n < input.minReplicates) {
    verdict = 'insufficient'
    reasons.push(`ต้องมีอย่างน้อย ${input.minReplicates} ซ้ำ (ตอนนี้ ${n})`)
  }
  if (invalid) reasons.push(`อ่านค่าไม่ได้ ${invalid} ผล (ไม่นับ)`)
  if (verdict !== 'insufficient' && detectPercent != null && detectPercent < input.minDetectPercent) {
    verdict = 'failed'
    reasons.push(`ตรวจพบ ${detected}/${n} (${detectPercent.toFixed(1)}%) ต่ำกว่าเกณฑ์ ${input.minDetectPercent}%`)
  }
  return { n, detected, invalid, detectPercent: round(detectPercent, 1), verdict, reasons }
}

// ---------- Linearity / reportable range (EP06) ----------

export interface LinearityPointInput {
  expected: number | null
  values: string[]
}

export interface LinearityPointResult {
  expected: number | null
  expectedStat: number | null
  meanStat: number | null
  n: number
  deviation: number | null
  withinLimit: boolean | null
}

export interface LinearityResult {
  points: LinearityPointResult[]
  slope: number | null
  intercept: number | null
  r: number | null
  verdict: Verdict
  reasons: string[]
}

export const EP06_MIN_POINTS = 5

export function linearityVerification(points: LinearityPointInput[], scale: CompareScale, limit: number): LinearityResult {
  const results: LinearityPointResult[] = points.map((point) => {
    const values = point.values.map((raw) => toStat(raw, scale)).filter((value): value is number => value != null)
    const expectedStat = point.expected == null ? null : scale === 'log10' ? (point.expected > 0 ? Math.log10(point.expected) : null) : point.expected
    const meanStat = mean(values)
    let deviation: number | null = null
    if (expectedStat != null && meanStat != null) {
      deviation = scale === 'log10' ? meanStat - expectedStat : expectedStat !== 0 ? ((meanStat - expectedStat) / expectedStat) * 100 : null
    }
    return {
      expected: point.expected,
      expectedStat: round(expectedStat),
      meanStat: round(meanStat),
      n: values.length,
      deviation: round(deviation),
      withinLimit: deviation == null ? null : Math.abs(deviation) <= limit + 1e-12,
    }
  })
  const usable = results.filter((point) => point.expectedStat != null && point.meanStat != null)
  let slope: number | null = null
  let intercept: number | null = null
  let r: number | null = null
  if (usable.length >= 2) {
    const xs = usable.map((point) => point.expectedStat as number)
    const ys = usable.map((point) => point.meanStat as number)
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
    if (sxx > 0) {
      slope = sxy / sxx
      intercept = my - slope * mx
      r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
    }
  }
  const reasons: string[] = []
  let verdict: Verdict = 'passed'
  if (usable.length < EP06_MIN_POINTS) {
    verdict = 'insufficient'
    reasons.push(`ต้องมีอย่างน้อย ${EP06_MIN_POINTS} ระดับที่มีค่าคาดหวังและผลวัด (ตอนนี้ ${usable.length})`)
  } else {
    const out = usable.filter((point) => point.withinLimit === false)
    if (out.length) {
      verdict = 'failed'
      reasons.push(`${out.length} ระดับมีค่าเบี่ยงเบนเกิน ±${limit}${scale === 'log10' ? ' log' : '%'}`)
    }
  }
  return { points: results, slope: round(slope), intercept: round(intercept), r: round(r), verdict, reasons }
}

// Rows from Excel: one line per day (precision) or per level (linearity), tab separated.
export function parseGrid(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|;/).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
}
