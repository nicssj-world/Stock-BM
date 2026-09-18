import type { ParsedBarcode } from './barcode'

export type PackageScanCandidate = {
  itemId: string
  itemCode: string
  name: string
  unit: string
  packDescription?: string | null
}

export type PackageScanConflict = {
  code: 'ambiguous_gtin' | 'barcode_item_mismatch'
  message: string
  target: string
}

export type PackageScanMatch = {
  kind: 'exact_unique' | 'exact_ambiguous' | 'none'
  itemId: string | null
  candidates: PackageScanCandidate[]
}

export type PackageScanResolution = {
  parsed: ParsedBarcode
  itemId: string | null
  match: PackageScanMatch
  conflicts: PackageScanConflict[]
}

export function matchPackageBarcode(parsed: ParsedBarcode, candidates: PackageScanCandidate[], selectedItemId: string | null): PackageScanResolution {
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.itemId, candidate])).values()]
  if (!parsed.gtin || uniqueCandidates.length === 0) {
    return { parsed, itemId: null, match: { kind: 'none', itemId: null, candidates: [] }, conflicts: [] }
  }

  if (uniqueCandidates.length > 1) {
    // The user already chose one of the exact candidates from Item Master:
    // the barcode is consistent with that choice, nothing is guessed.
    if (selectedItemId && uniqueCandidates.some((candidate) => candidate.itemId === selectedItemId)) {
      return { parsed, itemId: selectedItemId, match: { kind: 'exact_ambiguous', itemId: selectedItemId, candidates: uniqueCandidates }, conflicts: [] }
    }
    return {
      parsed,
      itemId: null,
      match: { kind: 'exact_ambiguous', itemId: null, candidates: uniqueCandidates },
      conflicts: [{ code: 'ambiguous_gtin', message: 'GTIN ตรงกับหลายรายการ ต้องเลือก Item เองก่อนใช้ข้อมูล', target: 'stockItemId' }],
    }
  }

  const candidate = uniqueCandidates[0]
  if (selectedItemId && selectedItemId !== candidate.itemId) {
    return {
      parsed,
      itemId: null,
      match: { kind: 'exact_unique', itemId: null, candidates: uniqueCandidates },
      conflicts: [{ code: 'barcode_item_mismatch', message: 'GTIN ของ package ไม่ตรงกับ Item ที่เลือกไว้', target: 'stockItemId' }],
    }
  }

  return {
    parsed,
    itemId: candidate.itemId,
    match: { kind: 'exact_unique', itemId: candidate.itemId, candidates: uniqueCandidates },
    conflicts: [],
  }
}
