import { matchCatalogs, normalizeCatalog, type CatalogMatchItem } from './catalog-match'

export type InvoiceOcrItem = CatalogMatchItem

export type InvoiceOcrDraftLine = {
  lineNo: number
  sourceText: string
  catalogNoText: string | null
  descriptionText: string | null
  expectedQty: number
  lotText: string | null
  expiryText: string | null
  stockItemId: string | null
  matchMethod: 'exact_unique' | 'exact_ambiguous' | 'similar' | 'manual' | 'unmatched'
  matchConfidence: number | null
  candidateItemIds: string[]
  candidateReason: string
}

export type InvoiceOcrUnresolvedLine = {
  lineNo: number
  sourceText: string
  reason: 'catalog_like_unmatched' | 'no_strong_item_evidence'
  catalogLikeTokens: string[]
}

export type InvoiceOcrIgnoredLine = {
  lineNo: number
  sourceText: string
  reason: 'document_noise'
}

export type InvoiceOcrClassification = {
  candidateLines: InvoiceOcrDraftLine[]
  unresolvedLines: InvoiceOcrUnresolvedLine[]
  ignoredLines: InvoiceOcrIgnoredLine[]
}

const DOCUMENT_NOISE_PATTERNS = [
  /\b(?:shipping|delivery|freight|tax|vat|subtotal|total|copy|original|signature|page|address|customer|supplier|bill\s+to|ship\s+to|payment|terms|qr|barcode)\b/i,
  /(?:สำเนา|ต้นฉบับ|ใบส่งสินค้า|ค่าขนส่ง|จัดส่ง|ภาษี|ยอดรวม|รวมทั้งสิ้น|ที่อยู่|ลูกค้า|ผู้ขาย|ลายเซ็น|เงื่อนไข|ชำระเงิน|คิวอาร์|บาร์โค้ด)/,
]

function firstMatch(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() || null
}

function quantity(text: string) {
  const value = firstMatch(text, /(?:qty|quantity|จำนวน)\s*[:#x-]?\s*(\d+(?:\.\d+)?)/i)
  const parsed = value ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function matchMethod(kind: ReturnType<typeof matchCatalogs>['kind']): InvoiceOcrDraftLine['matchMethod'] {
  return kind === 'none' ? 'unmatched' : kind
}

function canonicalLine(value: string) {
  return value.toLocaleLowerCase().replace(/[\u200b\u00a0]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isDocumentNoise(text: string) {
  return DOCUMENT_NOISE_PATTERNS.some((pattern) => pattern.test(text))
}

function isDateToken(value: string) {
  return /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(value)
}

export function extractCatalogLikeTokens(text: string) {
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9._/-]*/g) ?? []
  return [...new Set(tokens.filter((token) => {
    if (isDateToken(token)) return false
    const normalized = normalizeCatalog(token)
    const digits = (normalized.match(/\d/g) ?? []).length
    return normalized.length >= 4 && digits >= 3
  }))]
}

function dedupeLines(rawText: string) {
  const seen = new Set<string>()
  return rawText
    .split(/\r?\n/)
    .map((sourceText) => sourceText.trim())
    .filter(Boolean)
    .filter((sourceText) => {
      const key = canonicalLine(sourceText)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 100)
}

export function classifyInvoiceOcrText(rawText: string, items: InvoiceOcrItem[]): InvoiceOcrClassification {
  const candidateLines: InvoiceOcrDraftLine[] = []
  const unresolvedLines: InvoiceOcrUnresolvedLine[] = []
  const ignoredLines: InvoiceOcrIgnoredLine[] = []

  dedupeLines(rawText).forEach((sourceText, index) => {
    const lineNo = index + 1
    if (isDocumentNoise(sourceText)) {
      ignoredLines.push({ lineNo, sourceText, reason: 'document_noise' })
      return
    }

    const catalogLikeTokens = extractCatalogLikeTokens(sourceText)
    const match = matchCatalogs(sourceText, items)
    const candidate = match.kind === 'exact_unique' ? match.candidate : null
    const isCandidate = match.kind === 'exact_unique' || match.kind === 'exact_ambiguous' || (match.kind === 'similar' && catalogLikeTokens.length > 0)

    if (!isCandidate) {
      unresolvedLines.push({
        lineNo,
        sourceText,
        reason: catalogLikeTokens.length ? 'catalog_like_unmatched' : 'no_strong_item_evidence',
        catalogLikeTokens,
      })
      return
    }

    const candidateItemIds = match.kind === 'exact_unique'
      ? [match.itemId]
      : match.kind === 'exact_ambiguous'
        ? match.itemIds
        : match.kind === 'similar'
          ? match.candidates.map((item) => item.itemId)
          : []
    const candidateReason = match.kind === 'exact_unique'
      ? 'exact catalog/REF matched an Item Master record'
      : match.kind === 'exact_ambiguous'
        ? 'exact catalog/REF matched multiple Item Master records'
        : 'catalog-like OCR token is similar to Item Master catalog data'

    candidateLines.push({
      lineNo,
      sourceText,
      catalogNoText: candidate?.catalogNo ?? null,
      descriptionText: candidate?.name ?? null,
      expectedQty: quantity(sourceText),
      lotText: firstMatch(sourceText, /(?:lot|batch)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i),
      expiryText: firstMatch(sourceText, /(?:exp|expiry|expire|หมดอายุ)\s*[:#-]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})/i),
      stockItemId: candidate?.itemId ?? null,
      matchMethod: matchMethod(match.kind),
      matchConfidence: match.kind === 'exact_unique' ? 1 : match.kind === 'similar' ? match.candidates[0]?.score ?? null : null,
      candidateItemIds,
      candidateReason,
    })
  })

  return { candidateLines, unresolvedLines, ignoredLines }
}

export function buildInvoiceOcrDraftLines(rawText: string, items: InvoiceOcrItem[]): InvoiceOcrDraftLine[] {
  return classifyInvoiceOcrText(rawText, items).candidateLines
}
