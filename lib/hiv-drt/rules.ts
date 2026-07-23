import { bangkokDateKey, daysUntil, todayBangkok } from '@/lib/bm/rules'
import type { HivDrtDestructionState, HivDrtSampleStatus, HivDrtTatState } from '@/lib/hiv-drt/types'

export const HIV_DRT_RACK_ROWS = 8
export const HIV_DRT_RACK_COLUMNS = 12
export const HIV_DRT_RACK_CAPACITY = HIV_DRT_RACK_ROWS * HIV_DRT_RACK_COLUMNS
export const HIV_DRT_TAT_BUSINESS_DAYS = 18
export const HIV_DRT_DESTRUCTION_WARNING_DAYS = 30

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function isBusinessDay(value: Date) {
  const day = value.getUTCDay()
  return day !== 0 && day !== 6
}

export function addBusinessDays(start: string, count: number) {
  const cursor = parseDateKey(start)
  let added = 0
  while (added < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (isBusinessDay(cursor)) added += 1
  }
  return dateKey(cursor)
}

export function businessDaysElapsed(start: string, end: string) {
  const cursor = parseDateKey(start)
  const limit = parseDateKey(end)
  let elapsed = 0
  while (cursor < limit) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (cursor <= limit && isBusinessDay(cursor)) elapsed += 1
  }
  return elapsed
}

export function addCalendarMonths(start: string, count: number) {
  const source = parseDateKey(start)
  const day = source.getUTCDate()
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + count, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return dateKey(target)
}

export function nextHivDrtRackPosition(occupiedPositions: number[], startAt = 1) {
  const occupied = new Set(occupiedPositions)
  for (let position = Math.max(1, startAt); position <= HIV_DRT_RACK_CAPACITY; position += 1) {
    if (!occupied.has(position)) return position
  }
  return null
}

export function formatHivDrtPosition(position: number | null) {
  if (position === null) return '-'
  const row = Math.ceil(position / HIV_DRT_RACK_COLUMNS)
  const column = ((position - 1) % HIV_DRT_RACK_COLUMNS) + 1
  return `${String.fromCharCode(64 + row)}${column}`
}

export function getHivDrtTatState(
  checkedOutAt: string | null,
  status: HivDrtSampleStatus,
  today = todayBangkok(),
): HivDrtTatState {
  if (status === 'result_received') return 'complete'
  if (!checkedOutAt || status !== 'checked_out') return 'complete'
  return businessDaysElapsed(bangkokDateKey(checkedOutAt), today) > HIV_DRT_TAT_BUSINESS_DAYS ? 'overdue' : 'waiting'
}

export function getHivDrtDestructionState(
  destroyDueOn: string | null,
  status: HivDrtSampleStatus,
  today = todayBangkok(),
): HivDrtDestructionState {
  if (!destroyDueOn || status !== 'stored') return 'none'
  const remaining = daysUntil(destroyDueOn, today)
  if (remaining <= 0) return 'due_now'
  return remaining <= HIV_DRT_DESTRUCTION_WARNING_DAYS ? 'due_soon' : 'none'
}
