import type { ExpiryState, StockLot } from '@/lib/bm/types'

const DAY_MS = 24 * 60 * 60 * 1000

export function todayBangkok() {
  return bangkokDateKey(new Date())
}

export function bangkokDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const map = new Map(parts.map((part) => [part.type, part.value]))
  return `${map.get('year')}-${map.get('month')}-${map.get('day')}`
}

export function daysUntil(dateText: string, today = todayBangkok()) {
  const date = new Date(`${dateText}T00:00:00+07:00`).getTime()
  const base = new Date(`${today}T00:00:00+07:00`).getTime()
  return Math.round((date - base) / DAY_MS)
}

export function getExpiryState(expiryDate: string | null, warningDays = 90, today = todayBangkok()): ExpiryState {
  if (!expiryDate) return 'none'
  const remaining = daysUntil(expiryDate, today)
  if (remaining < 0) return 'expired'
  if (remaining <= warningDays) return 'expiring'
  return 'ok'
}

export function sortLotsFefo(lots: StockLot[]) {
  return [...lots].sort((a, b) => {
    const aDate = a.expiryDate ?? '9999-12-31'
    const bDate = b.expiryDate ?? '9999-12-31'
    if (aDate !== bDate) return aDate.localeCompare(bDate)
    if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt)
    return a.lotNumber.localeCompare(b.lotNumber)
  })
}

export function suggestedUsableLot(lots: StockLot[]) {
  return sortLotsFefo(lots).find((lot) => lot.usableOnHand > 0 && lot.expiryState !== 'expired') ?? null
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

export function formatDate(value: string | null) {
  if (!value) return '-'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+07:00`)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(date)
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

