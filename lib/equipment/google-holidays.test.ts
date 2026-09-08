import { describe, expect, it } from 'vitest'
import { parseIcsHolidays } from './google-holidays'

function ics(body: string) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`
}

describe('parseIcsHolidays', () => {
  it('parses a normal all-day holiday event', () => {
    const holidays = parseIcsHolidays(ics(
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260101\r\n' +
      'DTEND;VALUE=DATE:20260102\r\n' +
      "SUMMARY:New Year's Day\r\n" +
      'END:VEVENT',
    ))
    expect(holidays).toEqual([{ date: '2026-01-01', name: "New Year's Day" }])
  })

  it('unfolds a continuation line before reading SUMMARY', () => {
    const holidays = parseIcsHolidays(ics(
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20261205\r\n' +
      'SUMMARY:H.M. King Bhumibol Adulyade\r\n' +
      ' j Memorial Day\r\n' +
      'END:VEVENT',
    ))
    expect(holidays).toEqual([{ date: '2026-12-05', name: 'H.M. King Bhumibol Adulyadej Memorial Day' }])
  })

  it('skips an event with no DTSTART instead of throwing', () => {
    const holidays = parseIcsHolidays(ics(
      'BEGIN:VEVENT\r\n' +
      'SUMMARY:Missing date\r\n' +
      'END:VEVENT\r\n' +
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260413\r\n' +
      'SUMMARY:Songkran\r\n' +
      'END:VEVENT',
    ))
    expect(holidays).toEqual([{ date: '2026-04-13', name: 'Songkran' }])
  })

  it('excludes cultural observances the feed bundles in that are not actual Thai public holidays', () => {
    const holidays = parseIcsHolidays(ics(
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260214\r\n' +
      'SUMMARY:วันวาเลนไทน์\r\n' +
      'END:VEVENT\r\n' +
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20261224\r\n' +
      'SUMMARY:วันคริสต์มาสอีฟ\r\n' +
      'END:VEVENT\r\n' +
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260101\r\n' +
      'SUMMARY:วันขื้นปีใหม่\r\n' +
      'END:VEVENT',
    ))
    expect(holidays).toEqual([{ date: '2026-01-01', name: 'วันขื้นปีใหม่' }])
  })

  it('unescapes ICS text and falls back to a generic name when SUMMARY is blank', () => {
    const holidays = parseIcsHolidays(ics(
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260706\r\n' +
      'SUMMARY:Asalha Puja\\, Buddhist Lent begins\r\n' +
      'END:VEVENT\r\n' +
      'BEGIN:VEVENT\r\n' +
      'DTSTART;VALUE=DATE:20260707\r\n' +
      'END:VEVENT',
    ))
    expect(holidays).toEqual([
      { date: '2026-07-06', name: 'Asalha Puja, Buddhist Lent begins' },
      { date: '2026-07-07', name: 'วันหยุด' },
    ])
  })
})
