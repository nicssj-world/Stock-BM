'use client'

import '@/components/calendar/calendar.css'
import Link from 'next/link'
import { ArrowRight, Users } from 'lucide-react'
import { DAY_PART_LABEL, dayOfWeek, THAI_DAYS, thaiShortDate } from '@/lib/calendar/rules'
import type { CalendarTodaySummary } from '@/lib/calendar/types'
import { CalendarIcon, COLOR_HEX } from '@/components/calendar/calendar-icon'

/** Dashboard strip: today's duty, who is away, and headcount. Links to the calendar's day view. */
export function CalendarTodayCard({ summary }: { summary: CalendarTodaySummary }) {
  const offDay = summary.holidayName ?? (summary.isWeekend ? 'วันหยุดสุดสัปดาห์' : null)
  return (
    <Link
      href={`/calendar?view=day&date=${summary.date}`}
      className="cal paper group grid gap-3 rounded-lg p-4 transition hover:border-[#9fc9c6] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-5"
    >
      <div className="flex items-baseline gap-2 md:block">
        <p className="font-bold text-[#173d50]">วันนี้</p>
        <p className="text-xs text-[#6a838c]">{THAI_DAYS[dayOfWeek(summary.date)]} {thaiShortDate(summary.date)}</p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {offDay ? <span className="cal-holiday !text-[13px]"><span>{offDay}</span></span> : null}
        {summary.duty.map((group) => (
          <span key={group.typeName} className="inline-flex items-center gap-1.5" style={{ '--c': COLOR_HEX[group.colorKey] } as React.CSSProperties}>
            <span className="cal-badge !size-7"><CalendarIcon iconKey={group.iconKey} size={17} /></span>
            <span className="text-[#6a838c]">{group.typeName}</span>
            <b className="text-[#173d50]">{group.people.join(', ')}</b>
          </span>
        ))}
        {!summary.duty.length && !summary.away.length && !offDay ? <span className="text-[#6a838c]">ยังไม่มีใครลงรายการวันนี้</span> : null}
        {summary.away.length ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[#6a838c]">ลา</span>
            {summary.away.map((person, index) => (
              <span key={`${person.name}-${index}`} className="cal-chip !w-auto" style={{ '--c': COLOR_HEX[person.colorKey] } as React.CSSProperties} title={person.typeName}>
                <CalendarIcon iconKey={person.iconKey} size={15} className="text-[var(--c)]" />
                <span className="font-semibold">{person.name}</span>
                {person.dayPart !== 'full' ? <span className="text-[11px] opacity-80">{DAY_PART_LABEL[person.dayPart]}</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-sm text-[#6a838c]">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4" /> อยู่ <b className="mono text-[#173d50]">{summary.presentCount}/{summary.staffCount}</b>
        </span>
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-[#0b7f76]" />
      </div>
    </Link>
  )
}
