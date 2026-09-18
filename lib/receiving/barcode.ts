const GROUP_SEPARATOR = '\u001d'

const GS1_SYMBOLOGY_IDS = new Set([']C1', ']d2', ']e0'])
const GS1_PREFIX = /^\](?:C1|d2|e0)/
const HIBC_SYMBOLOGY_PREFIX = /^\](?:A0|C0)/

type BarcodeStandard = 'gs1' | 'hibc'

export type CatalogCandidate = {
  value: string
  source: 'ai240'
  reason: string
}

export type ParsedBarcode = {
  raw: string
  symbologyId: string | null
  standard: BarcodeStandard | null
  gtin: string | null
  catalog: string | null
  /** AI 240 — Additional Product Identification. Kept separate from `catalog`: never auto-copied into it. */
  additionalProductId: string | null
  /**
   * A *proposed* Catalog/REF value with the reason it was proposed — never
   * auto-applied to `catalog`. AI 240 is only manufacturer-meaningful as a
   * REF stand-in for labels known to print it that way (see
   * `AI240_CATALOG_CANDIDATE_GTIN_PREFIXES`); it is not a general GS1 rule.
   */
  catalogCandidate: CatalogCandidate | null
  lot: string | null
  expiry: string | null
  manufactureDate: string | null
  bestBeforeDate: string | null
  serial: string | null
  quantity: number | null
  netWeightKg: number | null
  hibcPrimary: string | null
  hibcSecondary: string | null
  /** Recognised GS1 AIs that receiving does not use (e.g. 91–99, 7003), kept verbatim for audit. */
  otherAis: Record<string, string>
}

type Gs1Result = ParsedBarcode

const emptyResult = (raw: string, symbologyId: string | null): ParsedBarcode => ({
  raw,
  symbologyId,
  standard: null,
  gtin: null,
  catalog: null,
  additionalProductId: null,
  catalogCandidate: null,
  lot: null,
  expiry: null,
  manufactureDate: null,
  bestBeforeDate: null,
  serial: null,
  quantity: null,
  netWeightKg: null,
  hibcPrimary: null,
  hibcSecondary: null,
  otherAis: {},
})

// GS1 General Specifications: the first two digits of an AI decide how many
// digits the AI itself has, and a small set of AIs carry predefined
// fixed-length data. Every other AI is variable-length and ends at FNC1/GS
// or at the end of the message. Knowing the full length table lets a label
// that carries extra AIs (91–99, 7003, 422 …) still yield Lot/Expiry.
const AI_DIGITS_BY_PREFIX: Record<string, 2 | 3 | 4> = {}
for (const prefix of ['00', '01', '02', '03', '04', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99']) AI_DIGITS_BY_PREFIX[prefix] = 2
for (const prefix of ['23', '24', '25', '40', '41', '42', '71']) AI_DIGITS_BY_PREFIX[prefix] = 3
for (const prefix of ['31', '32', '33', '34', '35', '36', '39', '43', '70', '72', '80', '81', '82']) AI_DIGITS_BY_PREFIX[prefix] = 4

const FIXED_DATA_LENGTH_BY_PREFIX: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
  '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6,
  '20': 2,
  '31': 6, '32': 6, '33': 6, '34': 6, '35': 6, '36': 6,
  '41': 13,
}

function detectedSymbologyId(value: string): string | null {
  return value.match(GS1_PREFIX)?.[0] ?? value.match(HIBC_SYMBOLOGY_PREFIX)?.[0] ?? null
}

function normalizedSymbologyId(value: string, symbologyId?: string | null): string | null {
  const supplied = symbologyId?.trim()
  return supplied || detectedSymbologyId(value.trim())
}

function stripSymbologyPrefix(value: string): { payload: string; prefix: string | null } {
  const gs1Prefix = value.match(GS1_PREFIX)?.[0]
  if (gs1Prefix) return { payload: value.slice(gs1Prefix.length), prefix: gs1Prefix }

  const hibcPrefix = value.match(HIBC_SYMBOLOGY_PREFIX)?.[0]
  if (hibcPrefix) return { payload: value.slice(hibcPrefix.length), prefix: hibcPrefix }

  return { payload: value, prefix: null }
}

function isValidPrintable(value: string): boolean {
  return value.length > 0 && /^[\x20-\x7e]+$/.test(value)
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function gs1Date(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null
  const twoDigitYear = Number(value.slice(0, 2))
  const year = twoDigitYear >= 50 ? 1900 + twoDigitYear : 2000 + twoDigitYear
  return isoDate(year, Number(value.slice(2, 4)), Number(value.slice(4, 6)))
}

function applyGs1Ai(result: Gs1Result, seen: Set<string>, ai: string, value: string): boolean {
  if (seen.has(ai)) return false
  seen.add(ai)

  switch (ai) {
    case '01':
      if (!/^\d{14}$/.test(value)) return false
      result.gtin = value
      return true
    case '10':
      if (!isValidPrintable(value)) return false
      result.lot = value
      return true
    case '11': {
      const date = gs1Date(value)
      if (!date) return false
      result.manufactureDate = date
      return true
    }
    case '15': {
      const date = gs1Date(value)
      if (!date) return false
      result.bestBeforeDate = date
      return true
    }
    case '17': {
      const date = gs1Date(value)
      if (!date) return false
      result.expiry = date
      return true
    }
    case '21':
      if (!isValidPrintable(value)) return false
      result.serial = value
      return true
    case '240':
      if (!isValidPrintable(value)) return false
      result.additionalProductId = value
      return true
    case '30':
      if (!/^\d+$/.test(value)) return false
      result.quantity = Number(value)
      return Number.isSafeInteger(result.quantity)
    default:
      if (/^310\d$/.test(ai)) {
        if (!/^\d{6}$/.test(value)) return false
        result.netWeightKg = Number(value) / 10 ** Number(ai.slice(3))
        return Number.isFinite(result.netWeightKg)
      }
      if (!isValidPrintable(value)) return false
      result.otherAis[ai] = value
      return true
  }
}

function gs1AiAt(payload: string, position: number): { ai: string; length: number } | null {
  const prefix = payload.slice(position, position + 2)
  const digits = AI_DIGITS_BY_PREFIX[prefix]
  if (!digits) return null
  const ai = payload.slice(position, position + digits)
  if (ai.length !== digits || !/^\d+$/.test(ai)) return null
  return { ai, length: FIXED_DATA_LENGTH_BY_PREFIX[prefix] ?? 0 }
}

/** Outcome of attempting to read AIs out of an already-canonical GS1 element string. */
export type Gs1ParseOutcome = { ok: true; result: ParsedBarcode } | { ok: false; reason: string }

function parseGs1Stream(payload: string, raw: string, symbologyId: string | null): Gs1ParseOutcome {
  const result = emptyResult(raw, symbologyId)
  result.standard = 'gs1'
  const seen = new Set<string>()
  let position = 0

  while (position < payload.length) {
    if (payload[position] === GROUP_SEPARATOR) {
      position += 1
      continue
    }

    const definition = gs1AiAt(payload, position)
    if (!definition) return { ok: false, reason: `Unrecognized AI at payload position ${position}: "${payload.slice(position, position + 4)}"` }
    position += definition.ai.length

    let value: string
    if (definition.length > 0) {
      value = payload.slice(position, position + definition.length)
      if (value.length !== definition.length || !/^\d+$/.test(value)) {
        return { ok: false, reason: `AI ${definition.ai} expects ${definition.length} digits but found "${value}"` }
      }
      position += definition.length
    } else {
      const separatorPosition = payload.indexOf(GROUP_SEPARATOR, position)
      const end = separatorPosition === -1 ? payload.length : separatorPosition
      value = payload.slice(position, end)
      if (!value) return { ok: false, reason: `AI ${definition.ai} has an empty variable-length value` }
      if (separatorPosition === -1) position = end
      else position = separatorPosition + 1
    }

    if (!applyGs1Ai(result, seen, definition.ai, value)) return { ok: false, reason: `AI ${definition.ai} value failed validation: "${value}"` }
  }

  return { ok: true, result }
}

function parenthesizedAiAt(payload: string, position: number): { ai: string; nextPosition: number } | null {
  const match = payload.slice(position).match(/^\((\d{2,4})\)/)
  if (!match || AI_DIGITS_BY_PREFIX[match[1].slice(0, 2)] !== match[1].length) return null
  return { ai: match[1], nextPosition: position + match[0].length }
}

function parseParenthesizedGs1(payload: string, raw: string, symbologyId: string | null): Gs1ParseOutcome {
  const result = emptyResult(raw, symbologyId)
  result.standard = 'gs1'
  const seen = new Set<string>()
  let position = 0

  while (position < payload.length) {
    if (payload[position] === GROUP_SEPARATOR) {
      position += 1
      continue
    }

    const definition = parenthesizedAiAt(payload, position)
    if (!definition) return { ok: false, reason: `Unrecognized parenthesized AI at position ${position}: "${payload.slice(position, position + 6)}"` }
    const valueStart = definition.nextPosition
    const nextAiPosition = payload.indexOf('(', valueStart)
    const valueEnd = nextAiPosition === -1 ? payload.length : nextAiPosition
    const value = payload.slice(valueStart, valueEnd)
    if (!value || value.includes(GROUP_SEPARATOR)) return { ok: false, reason: `AI ${definition.ai} has an empty or invalid value` }
    if (!applyGs1Ai(result, seen, definition.ai, value)) return { ok: false, reason: `AI ${definition.ai} value failed validation: "${value}"` }
    position = valueEnd
  }

  return { ok: true, result }
}

// Human/keyboard-wedge spellings of FNC1 or the Group Separator. Only these
// explicit tokens are rewritten to ASCII 29; nothing else is touched.
// U+241D is the visible GS symbol some tools print in place of the real separator.
const SEPARATOR_NOTATIONS = /<GS>|\{GS\}|\[GS\]|<FNC1>|\{FNC1\}|\[FNC1\]|\\x1[dD]|\\u001[dD]|\u241D/g

/** Rewrites textual FNC1/GS notations ("<GS>", "{FNC1}", a literal backslash-x1d, "␝" …) to ASCII 29. */
export function normalizeSeparatorNotation(value: string): string {
  return value.replace(SEPARATOR_NOTATIONS, GROUP_SEPARATOR)
}

/**
 * The ONE canonical normalization step, run before any AI parsing, that
 * turns whatever a scanner handed us into a clean GS1 element string:
 *
 *  1. Strip a literal "]d2" / "]C1" / "]e0" AIM symbology prefix if it is
 *     embedded directly in the text (keyboard-wedge scanners and some
 *     libraries do this; ZXing's BrowserMultiFormatReader does not — its
 *     `getText()` never carries the prefix, and @zxing/library exposes no
 *     separate symbology-identifier metadata for it either, which is why
 *     the symbology identifier has to be supplied out-of-band from the
 *     detected barcode format instead — see camera-scanner.ts).
 *
 *  2. Strip a LEADING run of ASCII 29 (Group Separator) characters. A GS1
 *     DataMatrix/QR message starts with an FNC1 codeword whose only job is
 *     to flag "this message is GS1-formatted" — it is not itself data.
 *     ZXing's DataMatrix/QR decoders (like every AIM-compliant decoder)
 *     translate every FNC1 codeword, including that leading one, into a
 *     literal GS character in the decoded text. Left in place, that leading
 *     GS defeats a naive "does this start with a known AI" check even
 *     though the real AI stream right behind it is perfectly well-formed.
 *
 * This function NEVER strips a GS that isn't part of that leading run: a
 * mid-stream GS is a real variable-length-field terminator (AI 10, 21, 240,
 * …) and the AI parser depends on it being there to find field boundaries.
 */
export function normalizeGs1DataMatrixPayload(value: string): string {
  const { payload } = stripSymbologyPrefix(normalizeSeparatorNotation(value))
  let index = 0
  while (payload[index] === GROUP_SEPARATOR) index += 1
  return payload.slice(index)
}

function looksLikeGs1(canonicalPayload: string, symbologyId: string | null): boolean {
  return GS1_SYMBOLOGY_IDS.has(symbologyId ?? '') || /^\(\d{2,4}\)/.test(canonicalPayload) || /^(?:01\d{14}|17\d{6}|11\d{6}|15\d{6}|10[ -~]|21[ -~]|240[ -~]|30\d|310\d)/.test(canonicalPayload)
}

/**
 * AI 240 (Additional Product Identification) has no universal GS1 meaning
 * as a "catalog number" — GS1 does not define it that way, and most
 * manufacturers use it for internal/proprietary identifiers unrelated to
 * REF. It is only useful as a Catalog/REF *candidate* for labels that are
 * independently known to print it that way. Each entry here must be backed
 * by a real, confirmed label — this is not a general "AI 240 = Catalog"
 * rule, and nothing here changes `catalog` itself (only `catalogCandidate`,
 * which is always presented as a suggestion for manual confirmation).
 */
const AI240_CATALOG_CANDIDATE_GTIN_PREFIXES: { prefix: string; manufacturer: string }[] = [
  // Roche cobas-style reagent labels (e.g. cobas TPUC3, REF 08058679190,
  // GTIN 07613336121535) print AI 240 directly beside the human-readable
  // REF field.
  { prefix: '07613336', manufacturer: 'Roche cobas' },
]

function proposeCatalogCandidate(result: ParsedBarcode): CatalogCandidate | null {
  if (!result.additionalProductId || !result.gtin) return null
  const match = AI240_CATALOG_CANDIDATE_GTIN_PREFIXES.find((entry) => result.gtin!.startsWith(entry.prefix))
  if (!match) return null
  return {
    value: result.additionalProductId,
    source: 'ai240',
    reason: `${match.manufacturer} labels print AI 240 next to REF on this GTIN prefix — confirm before using as Catalog/REF`,
  }
}

function parseGs1(canonicalPayload: string, raw: string, symbologyId: string | null): Gs1ParseOutcome {
  const outcome = canonicalPayload.includes('(')
    ? parseParenthesizedGs1(canonicalPayload, raw, symbologyId)
    : parseGs1Stream(canonicalPayload, raw, symbologyId)
  if (outcome.ok) outcome.result.catalogCandidate = proposeCatalogCandidate(outcome.result)
  return outcome
}

function parseHibcDate(format: string, value: string): { date: string | null; valid: boolean } {
  const dateLength: Record<string, number> = { '0': 4, '1': 4, '2': 6, '3': 6, '4': 8, '5': 5, '6': 7, '7': 0 }
  const length = dateLength[format]
  if (length === undefined || !/^\d*$/.test(value) || value.length !== length) return { date: null, valid: false }
  if (format === '7') return { date: null, valid: true }
  if (format === '0' || format === '1') return { date: null, valid: true }

  if (format === '2') return { date: isoDate(2000 + Number(value.slice(4, 6)), Number(value.slice(0, 2)), Number(value.slice(2, 4))), valid: true }
  if (format === '3' || format === '4') return { date: gs1Date(value.slice(0, 6)), valid: true }

  const year = 2000 + Number(value.slice(0, 2))
  const dayOfYear = Number(value.slice(2, 5))
  if (dayOfYear < 1 || dayOfYear > 366) return { date: null, valid: false }
  const date = new Date(Date.UTC(year, 0, dayOfYear))
  return { date: isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()), valid: true }
}

function secondaryTrailerLength(standalone: boolean): number {
  return standalone ? 2 : 1
}

function parseHibcSecondary(segment: string, standalone: boolean): { lot: string; expiry: string | null } | null {
  if (!segment.startsWith('$$') || segment.length < 3) return null
  const format = segment[2]
  const dateLength: Record<string, number> = { '0': 4, '1': 4, '2': 6, '3': 6, '4': 8, '5': 5, '6': 7, '7': 0 }
  const length = dateLength[format]
  if (length === undefined) return null

  const dateStart = 3
  const dateEnd = dateStart + length
  const parsedDate = parseHibcDate(format, segment.slice(dateStart, dateEnd))
  if (!parsedDate.valid) return null

  const remainder = segment.slice(dateEnd)
  const trailerLength = secondaryTrailerLength(standalone)
  const candidateLot = remainder.length > trailerLength ? remainder.slice(0, -trailerLength) : remainder
  const lot = isValidPrintable(candidateLot) ? candidateLot : remainder
  if (!isValidPrintable(lot) || lot.length > 18 || lot.includes('/')) return null
  return { lot, expiry: parsedDate.date }
}

function parseHibcSupplemental(segment: string, result: ParsedBarcode): boolean {
  if (segment.startsWith('16D')) {
    const date = segment.slice(3)
    if (!/^\d{8}$/.test(date)) return false
    result.manufactureDate = isoDate(Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8)))
    return result.manufactureDate !== null
  }

  if (segment.startsWith('14D')) {
    const date = segment.slice(3)
    if (!/^\d{8}$/.test(date)) return false
    result.expiry = isoDate(Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8)))
    return result.expiry !== null
  }

  if (segment.startsWith('Q')) {
    const match = segment.match(/^Q(\d{1,8})(?:[A-Z])?$/)
    if (!match) return false
    result.quantity = Number(match[1])
    return Number.isSafeInteger(result.quantity)
  }

  return true
}

function parseHibc(raw: string, value: string, symbologyId: string | null): ParsedBarcode | null {
  const result = emptyResult(raw, symbologyId)
  result.standard = 'hibc'
  let payload = value
  if (payload.startsWith('*') && payload.endsWith('*')) payload = payload.slice(1, -1)
  if (!payload.startsWith('+')) return null

  const body = payload.slice(1)
  if (!isValidPrintable(body)) return null
  const segments = body.split('/')

  if (body.startsWith('$$')) {
    const secondary = segments.shift() ?? ''
    const parsed = parseHibcSecondary(secondary, true)
    if (!parsed) return null
    result.hibcSecondary = secondary
    result.lot = parsed.lot
    result.expiry = parsed.expiry
  } else if (segments.length > 1) {
    const primary = segments.shift() ?? ''
    const secondary = segments.shift() ?? ''
    if (!primary || !secondary || !isValidPrintable(primary)) return null
    const parsed = parseHibcSecondary(secondary, false)
    if (!parsed) return null
    result.hibcPrimary = primary
    result.hibcSecondary = secondary
    result.lot = parsed.lot
    result.expiry = parsed.expiry
  } else {
    if (body.length < 2) return null
    result.hibcPrimary = body.slice(0, -1)
  }

  for (const supplemental of segments) {
    if (!supplemental || !parseHibcSupplemental(supplemental, result)) return null
  }

  return result
}

/** Parse a captured GS1 or HIBC payload without selecting an Item Master record. */
export function parseBarcode(raw: string, symbologyId?: string | null): ParsedBarcode {
  const rawValue = typeof raw === 'string' ? raw : String(raw ?? '')
  const detected = normalizedSymbologyId(rawValue, symbologyId)
  try {
    const value = rawValue.trim()
    const canonicalGs1Payload = normalizeGs1DataMatrixPayload(value)

    const { payload } = stripSymbologyPrefix(value)
    if (looksLikeGs1(canonicalGs1Payload, detected)) {
      const outcome = parseGs1(canonicalGs1Payload, rawValue, detected)
      if (outcome.ok) return outcome.result
      // The camera infers "]d2"/"]C1" from the barcode format alone, so a
      // HIBC label printed as Data Matrix or Code 128 still arrives here.
      if (payload.startsWith('+')) return parseHibc(rawValue, value, detected) ?? emptyResult(rawValue, detected)
      return emptyResult(rawValue, detected)
    }
    if (payload.startsWith('+') || detected === 'HIBC' || detected === 'hibc') {
      return parseHibc(rawValue, value, detected) ?? emptyResult(rawValue, detected)
    }
  } catch {
    return emptyResult(rawValue, detected)
  }

  return emptyResult(rawValue, detected)
}

/**
 * Preview-only: the same parse as `parseBarcode`, but surfaces the
 * canonical (normalized) GS1 payload and, on failure, *why* — instead of a
 * silent empty result. Never used by production callers.
 */
export function parseBarcodeWithDiagnostics(raw: string, symbologyId?: string | null): {
  canonicalPayload: string | null
  result: ParsedBarcode
  parserError: string | null
} {
  const rawValue = typeof raw === 'string' ? raw : String(raw ?? '')
  const detected = normalizedSymbologyId(rawValue, symbologyId)
  const value = rawValue.trim()
  const canonicalGs1Payload = normalizeGs1DataMatrixPayload(value)

  if (looksLikeGs1(canonicalGs1Payload, detected)) {
    try {
      const outcome = parseGs1(canonicalGs1Payload, rawValue, detected)
      return {
        canonicalPayload: canonicalGs1Payload,
        result: outcome.ok ? outcome.result : emptyResult(rawValue, detected),
        parserError: outcome.ok ? null : outcome.reason,
      }
    } catch (error) {
      return { canonicalPayload: canonicalGs1Payload, result: emptyResult(rawValue, detected), parserError: error instanceof Error ? error.message : 'Unknown GS1 parse error' }
    }
  }

  return { canonicalPayload: null, result: parseBarcode(raw, symbologyId), parserError: null }
}
