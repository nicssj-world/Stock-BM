const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

export const TOR_THRESHOLD_MONTHS = 6

export type TorExpiryCompliance = 'compliant' | 'not_compliant' | 'not_applicable'

function parseIsoDate(value: string) {
  const match = ISO_DATE_ONLY.exec(value)
  if (!match) throw new RangeError(`Expected an ISO date-only value, got ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`Invalid ISO date-only value: ${value}`)
  }
  return { year, month, day }
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addCalendarMonths(iso: string, months: number) {
  parseIsoDate(iso)
  if (!Number.isInteger(months)) throw new RangeError('Calendar month count must be an integer')
  const { year, month, day } = parseIsoDate(iso)
  const absoluteMonth = year * 12 + (month - 1) + months
  const targetYear = Math.floor(absoluteMonth / 12)
  const targetMonth = absoluteMonth - targetYear * 12 + 1
  return formatIsoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))
}

export function remainingShelfLife(expiry: string | null, received: string) {
  if (!expiry) return null
  const expiryParts = parseIsoDate(expiry)
  const receivedParts = parseIsoDate(received)
  const expiryUtc = Date.UTC(expiryParts.year, expiryParts.month - 1, expiryParts.day)
  const receivedUtc = Date.UTC(receivedParts.year, receivedParts.month - 1, receivedParts.day)
  return Math.floor((expiryUtc - receivedUtc) / DAY_MS)
}

export function torExpiryCompliance(expiry: string | null, received: string): TorExpiryCompliance {
  if (!expiry) return 'not_applicable'
  return expiry > addCalendarMonths(received, TOR_THRESHOLD_MONTHS) ? 'compliant' : 'not_compliant'
}
