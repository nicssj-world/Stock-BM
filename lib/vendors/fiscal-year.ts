import { routineFiscalYearBounds, routineFiscalYearFor } from '@/lib/equipment/routine-maintenance'

/** Thai government fiscal year: 1 October through 30 September (Gregorian label, e.g. "2026"). */
export function vendorFiscalYearFor(value: string) {
  return routineFiscalYearFor(value)
}

export function vendorFiscalYearBounds(fiscalYear: string) {
  return routineFiscalYearBounds(fiscalYear)
}

export function vendorFiscalYearLabel(fiscalYear: string) {
  return `พ.ศ. ${Number(fiscalYear) + 543}`
}

/** Today in Bangkok as YYYY-MM-DD: the fiscal year turns over at Bangkok midnight, not UTC midnight. */
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Buddhist-era fiscal year used by the vendor evaluation module: 2026-10-01 -> 2570. */
export function fiscalYearBE(date: string) {
  return Number(routineFiscalYearFor(date)) + 543
}
