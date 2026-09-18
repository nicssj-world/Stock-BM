import { matchCatalogs, type CatalogMatchItem } from './catalog-match'

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
  matchMethod: 'exact_unique' | 'exact_ambiguous' | 'similar' | 'unmatched'
  matchConfidence: number | null
  candidateItemIds: string[]
}

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

export function buildInvoiceOcrDraftLines(rawText: string, items: InvoiceOcrItem[]): InvoiceOcrDraftLine[] {
  return rawText
    .split(/\r?\n/)
    .map((sourceText) => sourceText.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((sourceText, index) => {
      const match = matchCatalogs(sourceText, items)
      const candidate = match.kind === 'exact_unique' ? match.candidate : null
      const candidateItemIds = match.kind === 'exact_unique'
        ? [match.itemId]
        : match.kind === 'exact_ambiguous'
          ? match.itemIds
          : match.kind === 'similar'
            ? match.candidates.map((item) => item.itemId)
            : []
      return {
        lineNo: index + 1,
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
      }
    })
}
