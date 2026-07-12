import type { HpvSpecimenType } from '@/lib/hpv/types'

export const HPV_BOX_CAPACITY = 25

export interface HpvDistributionLike {
  siteId: string
  quantity: number
}

export interface HpvReceiptLike {
  siteId: string
  sampleCount: number
}

export interface HpvReturnLike {
  siteId: string
  quantity: number
}

export interface HpvSiteSummary {
  siteId: string
  issued: number
  received: number
  returned: number
  outstanding: number
  selfSupplied: boolean
}

export function nextHpvBoxPosition(occupiedPositions: number[], capacity = HPV_BOX_CAPACITY) {
  const occupied = new Set(occupiedPositions)
  for (let position = 1; position <= capacity; position += 1) {
    if (!occupied.has(position)) return position
  }
  return null
}

export function isHpvBoxFull(occupiedPositions: number[], capacity = HPV_BOX_CAPACITY) {
  return nextHpvBoxPosition(occupiedPositions, capacity) === null
}

export function isHpvSpecimenType(value: unknown): value is HpvSpecimenType {
  return value === 'self_collected' || value === 'clinician_collected'
}

export function specimenTypeLabel(type: HpvSpecimenType) {
  return type === 'self_collected' ? 'Self-collected' : 'Clinician-collected'
}

export function addOneMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
}

export function summarizeHpvSites(distributions: HpvDistributionLike[], receipts: HpvReceiptLike[], returns: HpvReturnLike[] = []): Record<string, HpvSiteSummary> {
  const summaries: Record<string, HpvSiteSummary> = {}
  function ensure(siteId: string) {
    summaries[siteId] ??= { siteId, issued: 0, received: 0, returned: 0, outstanding: 0, selfSupplied: false }
    return summaries[siteId]
  }

  for (const distribution of distributions) {
    const summary = ensure(distribution.siteId)
    summary.issued += distribution.quantity
  }
  for (const receipt of receipts) {
    const summary = ensure(receipt.siteId)
    summary.received += receipt.sampleCount
  }
  for (const kitReturn of returns) {
    const summary = ensure(kitReturn.siteId)
    summary.returned += kitReturn.quantity
  }
  for (const summary of Object.values(summaries)) {
    summary.outstanding = summary.selfSupplied ? 0 : summary.issued - summary.received - summary.returned
  }
  return summaries
}

export function formatHpvBoxPosition(position: number) {
  const row = Math.ceil(position / 5)
  const column = ((position - 1) % 5) + 1
  return `${String.fromCharCode(64 + row)}${column}`
}
