import { routineFiscalYearBounds, routineFiscalYearFor } from '@/lib/equipment/routine-maintenance'

/** Thai government fiscal year: 1 October through 30 September. */
export function vendorFiscalYearFor(value: string) {
  return routineFiscalYearFor(value)
}

export function vendorFiscalYearBounds(fiscalYear: string) {
  return routineFiscalYearBounds(fiscalYear)
}

export function vendorFiscalYearLabel(fiscalYear: string) {
  return `พ.ศ. ${Number(fiscalYear) + 543}`
}
