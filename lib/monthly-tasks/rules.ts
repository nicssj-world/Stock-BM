const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonthKey(value: string) {
  return MONTH_KEY_PATTERN.test(value)
}

export function assertMonthKey(value: string) {
  if (!isMonthKey(value)) throw new Error('Invalid month')
  return value
}

export function monthStart(month: string) {
  return `${assertMonthKey(month)}-01`
}

export function daysInMonth(month: string) {
  const [year, monthNumber] = assertMonthKey(month).split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

export function dueDateForMonth(month: string, dueDay: number) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('Invalid due day')
  const [year, monthNumber] = assertMonthKey(month).split('-').map(Number)
  const day = String(Math.min(dueDay, daysInMonth(month))).padStart(2, '0')
  return `${year}-${String(monthNumber).padStart(2, '0')}-${day}`
}

export function addMonths(month: string, offset: number) {
  const [year, monthNumber] = assertMonthKey(month).split('-').map(Number)
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}
