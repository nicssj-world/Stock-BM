import { COLOR_HEX, emojiFor } from '@/lib/calendar/palette'
import type { CalendarColor, CalendarKind, DayPart } from '@/lib/calendar/types'

/* ---------- date keys (YYYY-MM-DD, calendar dates with no time zone) ---------- */

const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const DAY_MS = 86_400_000

export function isDateKey(value: string) {
  if (!DATE_KEY.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function toUtc(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(dateKey: string, days: number) {
  return fromUtc(toUtc(dateKey) + days * DAY_MS)
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(dateKey: string) {
  return new Date(toUtc(dateKey)).getUTCDay()
}

export function isWeekend(dateKey: string) {
  const day = dayOfWeek(dateKey)
  return day === 0 || day === 6
}

export function eachDay(from: string, to: string) {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

/** Sunday-start week containing the date. */
export function weekRange(dateKey: string) {
  const from = addDays(dateKey, -dayOfWeek(dateKey))
  return { from, to: addDays(from, 6) }
}

/** Whole Sunday-start weeks covering a month (what the month grid shows). */
export function monthGridRange(month: string) {
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const last = fromUtc(Date.UTC(y, m, 0))
  return { from: weekRange(first).from, to: weekRange(last).to }
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  return fromUtc(Date.UTC(y, m - 1 + delta, 1)).slice(0, 7)
}

export function overlaps(event: { startDate: string; endDate: string }, from: string, to: string) {
  return event.startDate <= to && event.endDate >= from
}

export function covers(event: { startDate: string; endDate: string }, dateKey: string) {
  return event.startDate <= dateKey && event.endDate >= dateKey
}

/* ---------- Thai labels ---------- */

export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
export const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const DAY_PART_LABEL: Record<DayPart, string> = { full: 'ทั้งวัน', am: 'เช้า', pm: 'บ่าย' }
export const KIND_LABEL: Record<CalendarKind, string> = { duty: 'เวร/หน้าที่', leave: 'การลา', other: 'กิจกรรม' }

export function thaiShortDate(dateKey: string) {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${d} ${THAI_MONTHS_SHORT[m - 1]}`
}

export function thaiMonthYear(month: string) {
  const [y, m] = month.split('-').map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

export function thaiRange(startDate: string, endDate: string) {
  return startDate === endDate ? thaiShortDate(startDate) : `${thaiShortDate(startDate)} – ${thaiShortDate(endDate)}`
}

/* ---------- permissions ---------- */

/** Staff may change their own entries until this many days after the entry ends. */
export const STAFF_EDIT_WINDOW_DAYS = 7

type Editor = { id: string; role: string }

export function isLockedForStaff(endDate: string, today: string) {
  return endDate < addDays(today, -STAFF_EDIT_WINDOW_DAYS)
}

export function canEditEntry(editor: Editor, entry: { userId: string; endDate: string }, today: string) {
  if (editor.role === 'Admin') return true
  return entry.userId === editor.id && !isLockedForStaff(entry.endDate, today)
}

/** Returns a Thai error message, or null when the editor may save this entry. */
export function entryPermissionError(editor: Editor, entry: { userId: string; endDate: string }, today: string) {
  if (editor.role === 'Admin') return null
  if (entry.userId !== editor.id) return 'ลงหรือแก้ได้เฉพาะรายการของตัวเอง'
  if (isLockedForStaff(entry.endDate, today)) return `รายการที่ผ่านมาเกิน ${STAFF_EDIT_WINDOW_DAYS} วันแก้ไม่ได้ ติดต่อ Admin`
  return null
}

export function normalizeTypeName(name: string) {
  return name.replace(/\s/g, '').toLowerCase()
}

/* ---------- Google holiday calendar (iCal) ---------- */

export const GOOGLE_TH_HOLIDAY_ICS =
  'https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics'

export interface ParsedHoliday {
  uid: string
  date: string
  name: string
  isObservance: boolean
}

function unescapeIcsText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
}

function icsDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

/**
 * Parses Google's public Thai holiday calendar. Its DESCRIPTION is
 * "วันหยุดนักขัตฤกษ์" for public holidays and starts with "วันสำคัญ" for observances.
 */
export function parseGoogleHolidayIcs(text: string, range: { from: string; to: string }): ParsedHoliday[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const result: ParsedHoliday[] = []
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0]
    const field = (name: string) => {
      const match = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm').exec(body)
      return match ? match[1].trim() : ''
    }
    const uid = field('UID')
    const start = icsDate(field('DTSTART'))
    const endExclusive = icsDate(field('DTEND'))
    const name = unescapeIcsText(field('SUMMARY')).replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
    if (!uid || !start || !name || field('STATUS') === 'CANCELLED') continue
    const description = unescapeIcsText(field('DESCRIPTION'))
    const isObservance = !description.includes('วันหยุดนักขัตฤกษ์')
    const last = endExclusive && endExclusive > start ? addDays(endExclusive, -1) : start
    for (const date of eachDay(start, last)) {
      if (date < range.from || date > range.to) continue
      result.push({ uid: date === start ? uid : `${uid}#${date}`, date, name, isObservance })
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

/* ---------- LINE heads-up digest (sent the workday before) ---------- */

export interface DigestEntry {
  typeName: string
  iconKey: string
  colorKey: CalendarColor
  kind: CalendarKind
  sortOrder: number
  userName: string
  dayPart: DayPart
}

export interface DigestDay {
  date: string
  /** Weekend or a public holiday counted as a day off. */
  isOffDay: boolean
  holidayName: string | null
  entries: DigestEntry[]
}

/**
 * Days announced by a digest sent on `today`: tomorrow through the next workday,
 * so a Friday (or a day before a holiday) also covers the days off in between.
 */
export function digestTargetDays(today: string, isOffDay: (dateKey: string) => boolean) {
  const days: string[] = []
  for (let day = addDays(today, 1); days.length < 14; day = addDays(day, 1)) {
    days.push(day)
    if (!isOffDay(day)) break
  }
  return days
}

/** On days off only duty matters; leave on a Saturday is noise. */
export function relevantEntries(day: DigestDay) {
  return day.isOffDay ? day.entries.filter((entry) => entry.kind === 'duty') : day.entries
}

/** Sent only on workdays, and never empty. */
export function shouldSendDigest(todayIsOffDay: boolean, days: DigestDay[]) {
  return !todayIsOffDay && days.some((day) => relevantEntries(day).length > 0)
}

export interface DigestSection {
  date: string
  isTomorrow: boolean
  /** e.g. "เสาร์ 21 พ.ย." */
  label: string
  holidayName: string | null
  rows: { typeName: string; emoji: string; color: string; people: string }[]
}

/** Groups each announced day's entries by type (duty first), dropping days with nothing to say. */
export function digestSections(today: string, days: DigestDay[]): DigestSection[] {
  const order: Record<CalendarKind, number> = { duty: 0, leave: 1, other: 2 }
  const sections: DigestSection[] = []
  for (const day of days) {
    const entries = relevantEntries(day)
    if (!entries.length) continue
    const groups = new Map<string, DigestEntry[]>()
    for (const entry of [...entries].sort((a, b) => order[a.kind] - order[b.kind] || a.sortOrder - b.sortOrder || a.userName.localeCompare(b.userName, 'th'))) {
      groups.set(entry.typeName, [...(groups.get(entry.typeName) ?? []), entry])
    }
    sections.push({
      date: day.date,
      isTomorrow: day.date === addDays(today, 1),
      label: `${THAI_DAYS[dayOfWeek(day.date)]} ${thaiShortDate(day.date)}`,
      holidayName: day.holidayName,
      rows: [...groups].map(([typeName, items]) => ({
        typeName,
        emoji: emojiFor(items[0].iconKey),
        color: COLOR_HEX[items[0].colorKey] ?? COLOR_HEX.slate,
        people: items.map((item) => (item.dayPart === 'full' ? item.userName : `${item.userName} (${DAY_PART_LABEL[item.dayPart]})`)).join(', '),
      })),
    })
  }
  return sections
}

/** Plain-text version: LINE's notification preview and the fallback when a Flex message is rejected. */
export function buildDigestMessage(today: string, days: DigestDay[]) {
  const blocks = digestSections(today, days).map((section) => {
    const head = `${section.isTomorrow ? 'พรุ่งนี้ · ' : ''}${section.label}${section.holidayName ? ` (${section.holidayName})` : ''}`
    return [head, ...section.rows.map((row) => `${row.emoji} ${row.typeName}: ${row.people}`)].join('\n')
  })
  return ['📅 แจ้งล่วงหน้า', ...blocks].join('\n\n')
}

const INK = '#173d50'
const MUTED = '#6a838c'

/** Flex bubble in the app's colors. `calendarUrl` adds an "open calendar" button when known. */
export function buildDigestFlex(today: string, days: DigestDay[], calendarUrl?: string) {
  const sections = digestSections(today, days)
  const body: Record<string, unknown>[] = []
  sections.forEach((section, index) => {
    if (index > 0) body.push({ type: 'separator', margin: 'lg', color: '#e1eaeb' })
    const heading: Record<string, unknown>[] = [
      { type: 'text', text: section.isTomorrow ? `พรุ่งนี้ · ${section.label}` : section.label, weight: 'bold', size: 'md', color: INK, wrap: true },
    ]
    if (section.holidayName) heading.push({ type: 'text', text: section.holidayName, size: 'xs', color: '#b73a5c', wrap: true, margin: 'xs' })
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: index > 0 ? 'lg' : 'none',
      spacing: 'sm',
      contents: [
        ...heading,
        ...section.rows.map((row) => ({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          margin: 'sm',
          contents: [
            { type: 'text', text: row.emoji, size: 'sm', flex: 0 },
            { type: 'text', text: row.typeName, size: 'sm', weight: 'bold', color: row.color, flex: 0 },
            { type: 'text', text: row.people, size: 'sm', color: INK, wrap: true, flex: 1 },
          ],
        })),
      ],
    })
  })

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0b7f76',
      paddingAll: '16px',
      contents: [
        { type: 'text', text: '📅 แจ้งล่วงหน้า', weight: 'bold', size: 'lg', color: '#ffffff' },
        { type: 'text', text: 'ปฏิทินทีม · Molecular-CBH', size: 'xs', color: '#cce7eb', margin: 'xs' },
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body.length ? body : [{ type: 'text', text: 'ไม่มีรายการ', color: MUTED, size: 'sm' }] },
    styles: { header: { separator: false } },
  }
  if (calendarUrl) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{ type: 'button', style: 'primary', color: '#0b7f76', height: 'sm', action: { type: 'uri', label: 'เปิดปฏิทิน', uri: calendarUrl } }],
    }
  }
  const altText = buildDigestMessage(today, days)
  return { type: 'flex', altText: altText.length > 400 ? `${altText.slice(0, 397)}…` : altText, contents: bubble }
}

/* ---------- ICS feed for phone calendars ---------- */

export interface FeedEvent {
  uid: string
  startDate: string
  endDate: string
  summary: string
  updatedAt: string
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** RFC 5545 line folding at 75 octets without splitting a UTF-8 character. */
export function foldIcsLine(line: string) {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    const limit = parts.length ? 74 : 75
    if (size + bytes > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function icsStamp(iso: string) {
  const date = new Date(iso)
  const safe = Number.isNaN(date.getTime()) ? new Date(0) : date
  return safe.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function buildIcsFeed(calendarName: string, events: FeedEvent[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Molecular-CBH QMS//Team Calendar//TH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Bangkok',
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
    'X-PUBLISHED-TTL:PT4H',
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${icsStamp(event.updatedAt)}`,
      `LAST-MODIFIED:${icsStamp(event.updatedAt)}`,
      `DTSTART;VALUE=DATE:${event.startDate.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(event.endDate, 1).replace(/-/g, '')}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
