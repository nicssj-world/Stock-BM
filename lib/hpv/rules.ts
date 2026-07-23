import type { HpvBoxStatus, HpvDestructionState, HpvSpecimenType } from '@/lib/hpv/types'
import { bangkokDateKey, daysUntil, todayBangkok } from '@/lib/bm/rules'

export const HPV_BOX_CAPACITY = 25

export interface HpvDistributionLike {
  siteId: string
  quantity: number
}

export interface HpvReceiptLike {
  siteId: string
  sampleCount: number
  selfSupplied?: boolean
}

export interface HpvReturnLike {
  siteId: string
  quantity: number
}

export interface HpvSiteSummary {
  siteId: string
  issued: number
  received: number
  receivedSelfSupplied: number
  returned: number
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

export function resolveHpvStorageBoxes<T extends { id: string; status: HpvBoxStatus }>(boxes: T[], viewBoxId: string, intakeBoxId: string) {
  const openBoxes = boxes.filter((box) => box.status === 'open')
  return {
    openBoxes,
    viewBox: boxes.find((box) => box.id === viewBoxId) ?? boxes[0] ?? null,
    intakeBox: openBoxes.find((box) => box.id === intakeBoxId) ?? openBoxes[0] ?? null,
  }
}

export function isHpvSpecimenType(value: unknown): value is HpvSpecimenType {
  return value === 'self_collected' || value === 'clinician_collected'
}

export function specimenTypeLabel(type: HpvSpecimenType) {
  return type === 'self_collected' ? 'Self-collected' : 'Clinician-collected'
}

export function getHpvDestructionState(destroyDueAt: string | null, status: HpvBoxStatus, today = todayBangkok(), filledAt?: string | null): HpvDestructionState {
  if (!destroyDueAt || status !== 'full') return 'none'
  const dueAt = new Date(destroyDueAt)
  if (Number.isNaN(dueAt.getTime())) return 'none'
  const remaining = daysUntil(bangkokDateKey(dueAt), today)
  if (remaining <= 0) return 'due_now'
  const filledDate = filledAt ? new Date(filledAt) : null
  const warningAt = filledDate && !Number.isNaN(filledDate.getTime())
    ? shiftBangkokCalendarMonths(filledDate, 1)
    : shiftBangkokCalendarMonths(dueAt, -1)
  return daysUntil(bangkokDateKey(warningAt), today) <= 0 ? 'due_soon' : 'none'
}

export function addTwoMonths(date: Date) {
  return shiftBangkokCalendarMonths(date, 2)
}

function shiftBangkokCalendarMonths(date: Date, months: number) {
  const bangkokOffsetMs = 7 * 60 * 60 * 1000
  const bangkokTime = new Date(date.getTime() + bangkokOffsetMs)
  const targetMonth = new Date(Date.UTC(bangkokTime.getUTCFullYear(), bangkokTime.getUTCMonth() + months, 1))
  const lastTargetDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate()
  const target = Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(bangkokTime.getUTCDate(), lastTargetDay),
    bangkokTime.getUTCHours(),
    bangkokTime.getUTCMinutes(),
    bangkokTime.getUTCSeconds(),
    bangkokTime.getUTCMilliseconds(),
  )
  return new Date(target - bangkokOffsetMs)
}

export function summarizeHpvSites(distributions: HpvDistributionLike[], receipts: HpvReceiptLike[], returns: HpvReturnLike[] = []): Record<string, HpvSiteSummary> {
  const summaries: Record<string, HpvSiteSummary> = {}
  const receivedFromIssuedKits: Record<string, number> = {}
  function ensure(siteId: string) {
    summaries[siteId] ??= { siteId, issued: 0, received: 0, receivedSelfSupplied: 0, returned: 0, outstanding: 0 }
    receivedFromIssuedKits[siteId] ??= 0
    return summaries[siteId]
  }

  for (const distribution of distributions) {
    const summary = ensure(distribution.siteId)
    summary.issued += distribution.quantity
  }
  for (const receipt of receipts) {
    const summary = ensure(receipt.siteId)
    summary.received += receipt.sampleCount
    // Self-supplied receipts are samples collected with the site's own kits, so they
    // never reduce the outstanding balance of kits issued from central stock — but we
    // still surface the count separately so it's clear why issued/received don't line up.
    if (receipt.selfSupplied) summary.receivedSelfSupplied += receipt.sampleCount
    else receivedFromIssuedKits[receipt.siteId] += receipt.sampleCount
  }
  for (const kitReturn of returns) {
    const summary = ensure(kitReturn.siteId)
    summary.returned += kitReturn.quantity
  }
  for (const summary of Object.values(summaries)) {
    summary.outstanding = summary.issued - (receivedFromIssuedKits[summary.siteId] ?? 0) - summary.returned
  }
  return summaries
}

export function formatHpvBoxPosition(position: number | null) {
  if (position === null) return '-'
  const row = Math.ceil(position / 5)
  const column = ((position - 1) % 5) + 1
  return `${String.fromCharCode(64 + row)}${column}`
}
