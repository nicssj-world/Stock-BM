export const HPV_BOX_CAPACITY = 25

export interface HpvDistributionLike {
  siteId: string
  quantity: number
}

export interface HpvReceiptLike {
  siteId: string
  sampleCount: number
}

export interface HpvSiteSummary {
  siteId: string
  issued: number
  received: number
  outstanding: number
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

export function addOneMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
}

export function summarizeHpvSites(distributions: HpvDistributionLike[], receipts: HpvReceiptLike[]): Record<string, HpvSiteSummary> {
  const summaries: Record<string, HpvSiteSummary> = {}
  function ensure(siteId: string) {
    summaries[siteId] ??= { siteId, issued: 0, received: 0, outstanding: 0 }
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
  for (const summary of Object.values(summaries)) {
    summary.outstanding = summary.issued - summary.received
  }
  return summaries
}

export function formatHpvBoxPosition(position: number) {
  const row = Math.ceil(position / 5)
  const column = ((position - 1) % 5) + 1
  return `${String.fromCharCode(64 + row)}${column}`
}
