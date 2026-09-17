const THAI_BUDDHIST_LOCALE = 'th-TH-u-ca-buddhist'
const BANGKOK_TIME_ZONE = 'Asia/Bangkok'
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

type DateInput = string | Date

function toDate(value: DateInput) {
  if (value instanceof Date) return new Date(value.getTime())
  if (ISO_DATE_ONLY.test(value)) return new Date(`${value}T00:00:00+07:00`)
  return new Date(value)
}

function validDate(value: DateInput | null | undefined) {
  if (!value) return null
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatThaiDate(value: DateInput | null | undefined) {
  const date = validDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat(THAI_BUDDHIST_LOCALE, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: BANGKOK_TIME_ZONE,
  }).format(date)
}

export function formatThaiDateTime(value: DateInput | null | undefined) {
  const date = validDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat(THAI_BUDDHIST_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: BANGKOK_TIME_ZONE,
  }).format(date)
}

export function formatThaiMonthYear(value: DateInput | null | undefined) {
  const date = validDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat(THAI_BUDDHIST_LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: BANGKOK_TIME_ZONE,
  }).format(date)
}

export function toBuddhistYear(gregorianYear: number) {
  return gregorianYear + 543
}
