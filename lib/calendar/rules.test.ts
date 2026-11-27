import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  buildDigestFlex,
  buildDigestMessage,
  buildIcsFeed,
  canEditEntry,
  digestAnnounceDay,
  entryPermissionError,
  isWeekend,
  foldIcsLine,
  isDateKey,
  layoutWeekBars,
  monthGridRange,
  normalizeTypeName,
  parseGoogleHolidayIcs,
  shouldSendDigest,
  thaiCompactRange,
  weekRange,
  type DigestDay,
  type DigestEntry,
} from '@/lib/calendar/rules'

describe('calendar date keys', () => {
  it('validates real calendar dates only', () => {
    expect(isDateKey('2026-11-19')).toBe(true)
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(isDateKey('2026-11-19T00:00')).toBe(false)
  })

  it('does arithmetic without time zone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })

  it('uses Sunday-start weeks and whole weeks for the month grid', () => {
    expect(weekRange('2026-11-19')).toEqual({ from: '2026-11-15', to: '2026-11-21' })
    // November 2026 starts on a Sunday and ends on a Monday.
    expect(monthGridRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-05' })
  })
})

describe('entry permissions', () => {
  const today = '2026-11-19'
  const staff = { id: 'u1', role: 'Staff' }
  const admin = { id: 'a1', role: 'Admin' }

  it('lets staff manage only their own recent entries', () => {
    expect(entryPermissionError(staff, { userId: 'u1', endDate: '2026-11-12' }, today)).toBeNull()
    expect(entryPermissionError(staff, { userId: 'u1', endDate: '2026-11-11' }, today)).toContain('เกิน 7 วัน')
    expect(entryPermissionError(staff, { userId: 'u2', endDate: '2026-11-20' }, today)).toContain('ของตัวเอง')
  })

  it('lets any staff manage a lab-wide entry, within the same 7-day window', () => {
    expect(entryPermissionError(staff, { userId: null, endDate: '2026-11-20' }, today)).toBeNull()
    expect(entryPermissionError(staff, { userId: null, endDate: '2026-11-11' }, today)).toContain('เกิน 7 วัน')
  })

  it('lets admins edit anything', () => {
    expect(canEditEntry(admin, { userId: 'u2', endDate: '2025-01-01' }, today)).toBe(true)
  })

  it('treats spacing and case as the same type name', () => {
    expect(normalizeTypeName('ลา กิจ')).toBe(normalizeTypeName('ลากิจ'))
  })
})

// Excerpts from Google's real Thai holiday feed (folded lines, zero-width space, observance text).
const GOOGLE_SAMPLE = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261207',
  'DTEND;VALUE=DATE:20261208',
  'UID:20261207_drim314a2o2jmppgqmhv3g54p0@google.com',
  'DESCRIPTION:วันหยุดนักขัตฤกษ์',
  'STATUS:CONFIRMED',
  'SUMMARY:วันหยุดชดเชยวันคล้ายวันพระบรมราชสมภพ พระบาทสมเด็จพระบรมชนกาธิเบศรมห',
  ' าภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร และวันพ่อแห่งชาติ',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261210',
  'DTEND;VALUE=DATE:20261211',
  'UID:20261210_d0mc3di60djpgrq7h0fe8ui6o0@google.com',
  'DESCRIPTION:วันหยุดนักขัตฤกษ์',
  'STATUS:CONFIRMED',
  'SUMMARY:​วันรัฐธรรมนูญ',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261225',
  'DTEND;VALUE=DATE:20261226',
  'UID:20261225_bl7s2pk7eddbtenuag6nphcj98@google.com',
  'DESCRIPTION:วันสำคัญ\\nหากต้องการซ่อนวันสำคัญ ให้ไปที่การตั้งค่า Google ปฏิท',
  ' ิน > วันหยุดในไทย',
  'STATUS:CONFIRMED',
  'SUMMARY:วันคริสต์มาส',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20270413',
  'DTEND;VALUE=DATE:20270416',
  'UID:songkran@google.com',
  'DESCRIPTION:วันหยุดนักขัตฤกษ์',
  'SUMMARY:วันสงกรานต์',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20200101',
  'DTEND;VALUE=DATE:20200102',
  'UID:old@google.com',
  'DESCRIPTION:วันหยุดนักขัตฤกษ์',
  'SUMMARY:วันขึ้นปีใหม่',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('Google holiday parsing', () => {
  const parsed = parseGoogleHolidayIcs(GOOGLE_SAMPLE, { from: '2026-01-01', to: '2027-12-31' })

  it('unfolds long names and strips zero-width characters', () => {
    expect(parsed.find((h) => h.date === '2026-12-07')?.name).toBe('วันหยุดชดเชยวันคล้ายวันพระบรมราชสมภพ พระบาทสมเด็จพระบรมชนกาธิเบศรมหาภูมิพลอดุลยเดชมหาราช บรมนาถบพิตร และวันพ่อแห่งชาติ')
    expect(parsed.find((h) => h.date === '2026-12-10')?.name).toBe('วันรัฐธรรมนูญ')
  })

  it('marks observances from Google’s own label', () => {
    expect(parsed.find((h) => h.date === '2026-12-10')?.isObservance).toBe(false)
    expect(parsed.find((h) => h.date === '2026-12-25')?.isObservance).toBe(true)
  })

  it('expands multi-day events with stable per-day ids and drops dates outside the range', () => {
    const songkran = parsed.filter((h) => h.name === 'วันสงกรานต์')
    expect(songkran.map((h) => h.date)).toEqual(['2027-04-13', '2027-04-14', '2027-04-15'])
    expect(songkran.map((h) => h.uid)).toEqual(['songkran@google.com', 'songkran@google.com#2027-04-14', 'songkran@google.com#2027-04-15'])
    expect(parsed.some((h) => h.date === '2020-01-01')).toBe(false)
  })
})

describe('heads-up digest (sent the day before)', () => {
  const sick: DigestEntry = { typeName: 'ลาป่วย', iconKey: 'thermometer', colorKey: 'orange', kind: 'leave', sortOrder: 30, userName: 'บอม', dayPart: 'full' }
  const blood: DigestEntry = { typeName: 'เวรเจาะเลือด', iconKey: 'drop', colorKey: 'rose', kind: 'duty', sortOrder: 10, userName: 'เจ', dayPart: 'full' }
  const halfDay: DigestEntry = { typeName: 'ลากิจ', iconKey: 'briefcase', colorKey: 'amber', kind: 'leave', sortOrder: 20, userName: 'เมย์', dayPart: 'pm' }

  it('puts duty first, marks half days and labels tomorrow', () => {
    const message = buildDigestMessage('2026-11-18', [{ date: '2026-11-19', isOffDay: false, holidayName: null, entries: [sick, blood, halfDay] }])
    expect(message).toBe('📅 แจ้งล่วงหน้า\n\nพรุ่งนี้ · พฤหัสบดี 19 พ.ย.\n🩸 เวรเจาะเลือด: เจ\n💼 ลากิจ: เมย์ (บ่าย)\n🤒 ลาป่วย: บอม')
  })

  it('lists morning before afternoon within a type', () => {
    const base: DigestEntry = { typeName: 'ประชุม / อบรม', iconKey: 'presentation', colorKey: 'violet', kind: 'other', sortOrder: 50, userName: 'ก', dayPart: 'pm' }
    const pm = { ...base, userName: 'ก', dayPart: 'pm' as const }
    const am = { ...base, userName: 'ข', dayPart: 'am' as const }
    const message = buildDigestMessage('2026-11-25', [{ date: '2026-11-26', isOffDay: false, holidayName: null, entries: [pm, am] }])
    expect(message).toContain('ข (เช้า), ก (บ่าย)')
  })

  it('adds the title after the person but never the note', () => {
    const meeting: DigestEntry = { typeName: 'ประชุม / อบรม', iconKey: 'presentation', colorKey: 'violet', kind: 'other', sortOrder: 50, userName: 'เมย์', dayPart: 'pm', title: 'ประชุม QC' }
    const training: DigestEntry = { ...meeting, userName: 'บอม', dayPart: 'full', title: 'อบรม ISO 15189' }
    const message = buildDigestMessage('2026-11-18', [{ date: '2026-11-19', isOffDay: false, holidayName: null, entries: [meeting, training] }])
    expect(message).toContain('ประชุม / อบรม: บอม “อบรม ISO 15189”, เมย์ (บ่าย) “ประชุม QC”')
  })

  it('gives each titled person a full-width line with the title beneath', () => {
    const meeting: DigestEntry = { typeName: 'ประชุม / อบรม', iconKey: 'presentation', colorKey: 'violet', kind: 'other', sortOrder: 50, userName: 'เมย์', dayPart: 'pm', title: 'ประชุม QC' }
    const ot: DigestEntry = { typeName: 'OT CD4', iconKey: 'clipboard', colorKey: 'green', kind: 'duty', sortOrder: 5, userName: 'บอม', dayPart: 'full' }
    const json = JSON.stringify(buildDigestFlex('2026-11-18', [{ date: '2026-11-19', isOffDay: false, holidayName: null, entries: [meeting, { ...meeting, userName: 'เจ', dayPart: 'am', title: 'อบรม ISO' }, ot] }]).contents)
    expect(json).toContain('"text":"• เจ (เช้า)"')
    expect(json).toContain('"text":"อบรม ISO"')
    expect(json).toContain('"text":"• เมย์ (บ่าย)"')
    expect(json).not.toContain('“')
    // untitled types stay on one line
    expect(json).toContain('"text":"บอม"')
  })

  it('shows only duty on days off and skips empty days', () => {
    const days: DigestDay[] = [
      { date: '2026-11-21', isOffDay: true, holidayName: null, entries: [blood, sick] },
      { date: '2026-11-22', isOffDay: true, holidayName: null, entries: [sick] },
      { date: '2026-11-23', isOffDay: false, holidayName: null, entries: [halfDay] },
    ]
    expect(buildDigestMessage('2026-11-20', days)).toBe('📅 แจ้งล่วงหน้า\n\nพรุ่งนี้ · เสาร์ 21 พ.ย.\n🩸 เวรเจาะเลือด: เจ\n\nจันทร์ 23 พ.ย.\n💼 ลากิจ: เมย์ (บ่าย)')
  })

  it('builds a Flex bubble with typed colors, alt text and an optional button', () => {
    const days: DigestDay[] = [{ date: '2026-12-10', isOffDay: true, holidayName: 'วันรัฐธรรมนูญ', entries: [blood] }]
    const flex = buildDigestFlex('2026-12-09', days, 'https://example.test/calendar')
    expect(flex.type).toBe('flex')
    expect(flex.altText.startsWith('📅 แจ้งล่วงหน้า')).toBe(true)
    expect(flex.altText.length).toBeLessThanOrEqual(400)
    const json = JSON.stringify(flex.contents)
    expect(json).toContain('พรุ่งนี้ · พฤหัสบดี 10 ธ.ค.')
    expect(json).toContain('วันรัฐธรรมนูญ')
    expect(json).toContain('"color":"#c93a62"')
    expect(json).toContain('"uri":"https://example.test/calendar"')
    // every Flex color must be #RRGGBB
    for (const color of json.match(/"(?:color|backgroundColor)":"[^"]*"/g) ?? []) expect(color).toMatch(/"#[0-9a-f]{6}"$/i)
    expect(JSON.stringify(buildDigestFlex('2026-12-09', days).contents)).not.toContain('footer')
  })

  it('lays multi-day entries out as week bars in the lowest free lane', () => {
    const week = '2026-12-20' // Sun 20 – Sat 26
    const events = [
      { id: 'single', startDate: '2026-12-21', endDate: '2026-12-21' },
      { id: 'meeting', startDate: '2026-12-21', endDate: '2026-12-22' },
      { id: 'vacation', startDate: '2026-12-17', endDate: '2026-12-21' },
      { id: 'later', startDate: '2026-12-23', endDate: '2026-12-30' },
    ]
    const { bars, lanes } = layoutWeekBars(events, week)
    const byId = Object.fromEntries(bars.map((bar) => [bar.event.id, bar]))
    expect(bars.map((bar) => bar.event.id)).toEqual(['vacation', 'meeting', 'later'])
    expect(byId.vacation).toMatchObject({ column: 0, span: 2, lane: 0, continuesBefore: true, continuesAfter: false })
    expect(byId.meeting).toMatchObject({ column: 1, span: 2, lane: 1 })
    // Lane 0 is free again from Tuesday.
    expect(byId.later).toMatchObject({ column: 3, span: 4, lane: 0, continuesAfter: true })
    expect(lanes).toBe(2)
  })

  it('names a lab-wide entry by its title, or only its type, never an empty text', () => {
    const ot: DigestEntry = { typeName: 'OT NIPT 2 ทุ่ม', iconKey: 'flag', colorKey: 'indigo', kind: 'duty', sortOrder: 5, userName: null, dayPart: 'full' }
    const titled: DigestEntry = { ...ot, typeName: 'ตรวจเยี่ยม', kind: 'other', title: 'สรพ.', dayPart: 'am' }
    const days: DigestDay[] = [{ date: '2026-11-28', isOffDay: false, holidayName: null, entries: [ot, titled] }]
    const message = buildDigestMessage('2026-11-27', days)
    expect(message).toContain('OT NIPT 2 ทุ่ม\n')
    expect(message).not.toContain('OT NIPT 2 ทุ่ม:')
    expect(message).toContain('ตรวจเยี่ยม: สรพ. (เช้า)')
    const json = JSON.stringify(buildDigestFlex('2026-11-27', days).contents)
    expect(json).not.toContain('"text":""')
    expect(json).toContain('"text":"สรพ. (เช้า)"')
  })

  it('announces a multi-day entry once, with its range', () => {
    const weekend = (day: string) => isWeekend(day)
    // Mon 8 – Tue 9 Dec: announced for Mon 8 only.
    expect(digestAnnounceDay({ startDate: '2026-12-08', endDate: '2026-12-09', kind: 'leave' }, weekend)).toBe('2026-12-08')
    // Leave starting on a Saturday is first announced for Monday; duty on the Saturday itself.
    expect(digestAnnounceDay({ startDate: '2026-12-05', endDate: '2026-12-08', kind: 'leave' }, weekend)).toBe('2026-12-07')
    expect(digestAnnounceDay({ startDate: '2026-12-05', endDate: '2026-12-08', kind: 'duty' }, weekend)).toBe('2026-12-05')
    expect(digestAnnounceDay({ startDate: '2026-12-05', endDate: '2026-12-06', kind: 'leave' }, weekend)).toBeNull()

    const meeting: DigestEntry = { typeName: 'ประชุม / อบรม', iconKey: 'presentation', colorKey: 'violet', kind: 'other', sortOrder: 50, userName: 'Siriwat J.', dayPart: 'full', title: 'HIV กองควบคุมโรค', startDate: '2026-12-21', endDate: '2026-12-22' }
    const vacation: DigestEntry = { typeName: 'ลาพักร้อน', iconKey: 'umbrella', colorKey: 'sky', kind: 'leave', sortOrder: 40, userName: 'Siritorn C.', dayPart: 'full', startDate: '2026-11-30', endDate: '2026-12-02' }
    const message = buildDigestMessage('2026-11-27', [{ date: '2026-11-30', isOffDay: false, holidayName: null, entries: [meeting, vacation] }])
    expect(message).toContain('Siriwat J. (21–22 ธ.ค.) “HIV กองควบคุมโรค”')
    expect(message).toContain('Siritorn C. (30 พ.ย. – 2 ธ.ค.)')
    expect(thaiCompactRange('2026-12-08', '2026-12-08')).toBe('8 ธ.ค.')
  })

  it('names a calendar other than the main one in the text and the Flex header', () => {
    const days: DigestDay[] = [{ date: '2026-11-19', isOffDay: false, holidayName: null, entries: [blood] }]
    expect(buildDigestMessage('2026-11-18', days, 'ตารางเครื่องมือ').startsWith('📅 แจ้งล่วงหน้า · ตารางเครื่องมือ\n\n')).toBe(true)
    const flex = buildDigestFlex('2026-11-18', days, undefined, 'ตารางเครื่องมือ')
    expect(flex.altText.startsWith('📅 แจ้งล่วงหน้า · ตารางเครื่องมือ')).toBe(true)
    expect(JSON.stringify(flex.contents)).toContain('"text":"ตารางเครื่องมือ · Genomics-CBH"')
    expect(JSON.stringify(buildDigestFlex('2026-11-18', days).contents)).toContain('"text":"ปฏิทินทีม · Genomics-CBH"')
  })

  it('sends only when tomorrow has something relevant', () => {
    const empty: DigestDay = { date: '2026-11-19', isOffDay: false, holidayName: null, entries: [] }
    const leaveOnSaturday: DigestDay = { date: '2026-11-21', isOffDay: true, holidayName: null, entries: [sick] }
    const full: DigestDay = { date: '2026-11-19', isOffDay: false, holidayName: null, entries: [sick] }
    expect(shouldSendDigest([empty])).toBe(false)
    expect(shouldSendDigest([leaveOnSaturday])).toBe(false)
    expect(shouldSendDigest([full])).toBe(true)
  })
})

describe('ICS feed', () => {
  it('folds at 75 octets without splitting Thai characters', () => {
    const line = `SUMMARY:${'เวรเจาะเลือด'.repeat(10)}`
    const folded = foldIcsLine(line)
    const encoder = new TextEncoder()
    for (const part of folded.split('\r\n')) expect(encoder.encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('writes all-day events with an exclusive end date and escapes text', () => {
    const ics = buildIcsFeed('ทีม', [{ uid: 'e1@x', startDate: '2026-11-16', endDate: '2026-11-20', summary: 'ลาพักร้อน, แพร; test', updatedAt: '2026-11-10T06:40:00.000Z' }])
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116')
    expect(ics).toContain('DTEND;VALUE=DATE:20261121')
    expect(ics).toContain('SUMMARY:ลาพักร้อน\\, แพร\\; test')
    expect(ics).toContain('DTSTAMP:20261110T064000Z')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
