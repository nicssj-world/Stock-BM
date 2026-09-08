// Google publishes the Thai public holiday calendar as a public iCal feed —
// no API key or OAuth needed, just a plain HTTPS GET. `th.th#holiday` is the
// current calendar id (the older `en.thai#holiday` id now 500s) and gives
// Thai-language holiday names.
export const THAI_HOLIDAY_ICS_URL = 'https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics'

export type ParsedHoliday = { date: string; name: string }

// Verified against the live feed: alongside genuine government/royal/
// religious holidays (and their ชดเชย compensatory variants), this calendar
// also carries a couple of cultural observances that are ordinary working
// days in Thailand. Importing them would incorrectly shift maintenance
// schedules off a normal working day, so they're excluded by name.
const NON_HOLIDAY_NAME_PATTERN = /วาเลนไทน์|คริสต์มาส/

export function isKnownNonHoliday(name: string) {
  return NON_HOLIDAY_NAME_PATTERN.test(name)
}

// RFC5545: a continuation line starts with a single space or tab and its
// content (minus that one leading character) belongs to the previous line.
function unfoldIcsLines(text: string) {
  const rawLines = text.split(/\r\n|\n|\r/)
  const lines: string[] = []
  for (const rawLine of rawLines) {
    if ((rawLine.startsWith(' ') || rawLine.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += rawLine.slice(1)
    } else {
      lines.push(rawLine)
    }
  }
  return lines
}

function icsDateToKey(value: string) {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8)
  if (digits.length !== 8) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function unescapeIcsText(value: string) {
  return value.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

export function parseIcsHolidays(text: string): ParsedHoliday[] {
  const lines = unfoldIcsLines(text)
  const holidays: ParsedHoliday[] = []
  let inEvent = false
  let date: string | null = null
  let name = ''
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      date = null
      name = ''
      continue
    }
    if (line === 'END:VEVENT') {
      if (inEvent && date) holidays.push({ date, name: name || 'วันหยุด' })
      inEvent = false
      continue
    }
    if (!inEvent) continue
    const colonIndex = line.indexOf(':')
    if (colonIndex < 0) continue
    const property = line.slice(0, colonIndex).split(';')[0]
    const value = line.slice(colonIndex + 1)
    if (property === 'DTSTART') date = icsDateToKey(value)
    else if (property === 'SUMMARY') name = unescapeIcsText(value)
  }
  return holidays.filter((holiday) => !isKnownNonHoliday(holiday.name))
}
