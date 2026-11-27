'use client'

import './calendar.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Layers, LoaderCircle, Plus, Settings2, Smartphone, Tags } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import {
  addDays,
  addMonths,
  covers,
  dayOfWeek,
  DAY_PART_LABEL,
  DAY_PART_ORDER,
  eachDay,
  isWeekend,
  KIND_LABEL,
  layoutWeekBars,
  monthGridRange,
  THAI_DAYS,
  THAI_DAYS_SHORT,
  THAI_MONTHS,
  THAI_MONTHS_SHORT,
  thaiMonthYear,
  thaiRange,
  weekRange,
} from '@/lib/calendar/rules'
import type { CalendarBook, CalendarEvent, CalendarKind, CalendarType, CalendarWorkspace } from '@/lib/calendar/types'
import { api, Button, Notice, PageHeader } from '@/components/ui'
import { CalendarIcon, COLOR_HEX } from '@/components/calendar/calendar-icon'
import { CalendarBookDialog, EntryDialog, HolidayDialog, SubscribeDialog, TypeDialog, type EntryDraft } from '@/components/calendar/calendar-dialogs'

export type CalendarViewMode = 'month' | 'week' | 'day'

const KIND_ORDER: Record<CalendarKind, number> = { duty: 0, leave: 1, other: 2 }
const MOBILE_QUERY = '(max-width: 767px)'

function rangeFor(view: CalendarViewMode, anchor: string) {
  return view === 'month' ? monthGridRange(anchor.slice(0, 7)) : weekRange(anchor)
}

function calendarQuery(calendar: CalendarBook | undefined) {
  return calendar && !calendar.isDefault ? `cal=${calendar.id}&` : ''
}

function colorStyle(type: CalendarType | undefined) {
  return { '--c': COLOR_HEX[type?.colorKey ?? 'slate'] } as React.CSSProperties
}

function periodLabel(view: CalendarViewMode, anchor: string) {
  if (view === 'month') return thaiMonthYear(anchor.slice(0, 7))
  if (view === 'day') {
    const [y, m, d] = anchor.split('-').map(Number)
    return `${THAI_DAYS[dayOfWeek(anchor)]} ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
  }
  const { from, to } = weekRange(anchor)
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return fm === tm ? `${fd}–${td} ${THAI_MONTHS[fm - 1]} ${ty + 543}` : `${fd} ${THAI_MONTHS_SHORT[fm - 1]}${fy !== ty ? ` ${fy + 543}` : ''} – ${td} ${THAI_MONTHS_SHORT[tm - 1]} ${ty + 543}`
}

export function CalendarView({
  actor,
  initialData,
  initialView,
  initialDate,
}: {
  actor: BmActor
  initialData: CalendarWorkspace
  initialView: CalendarViewMode
  initialDate: string
}) {
  const [data, setData] = useState(initialData)
  const [view, setView] = useState<CalendarViewMode>(initialView)
  const [anchor, setAnchor] = useState(initialDate)
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [mineOnly, setMineOnly] = useState(false)
  const [entry, setEntry] = useState<EntryDraft | null>(null)
  const [dialog, setDialog] = useState<'types' | 'holidays' | 'subscribe' | 'calendars' | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const isAdmin = actor.role === 'Admin'
  const today = data.today
  const calendar = data.calendars.find((item) => item.id === data.calendarId) ?? data.calendars[0]

  /* phones get week/day only */
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY)
    const sync = () => {
      setIsMobile(query.matches)
      if (query.matches) setView((current) => (current === 'month' ? 'week' : current))
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const currentCalendarId = data.calendarId
  /** Loads a range of one calendar (the one on screen unless another is given). */
  const load = useCallback(
    async (from: string, to: string, calendarId: string = currentCalendarId) => {
      setLoading(true)
      setError('')
      try {
        const result = await api<{ workspace: CalendarWorkspace }>(`/api/calendar?from=${from}&to=${to}&calendar=${calendarId}`)
        setData(result.workspace)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'โหลดปฏิทินไม่สำเร็จ')
      } finally {
        setLoading(false)
      }
    },
    [currentCalendarId],
  )

  /* keep the URL shareable */
  useEffect(() => {
    window.history.replaceState(null, '', `/calendar?${calendarQuery(calendar)}view=${view}&date=${anchor}`)
  }, [view, anchor, calendar])

  function switchCalendar(calendarId: string) {
    if (calendarId === data.calendarId) return
    setHidden(new Set())
    const { from, to } = rangeFor(view, anchor)
    void load(from, to, calendarId)
  }

  /** Move the calendar; fetch only when the new range leaves the loaded one. */
  function go(nextView: CalendarViewMode, nextAnchor: string) {
    setView(nextView)
    setAnchor(nextAnchor)
    const { from, to } = rangeFor(nextView, nextAnchor)
    if (from < data.from || to > data.to) void load(from, to)
  }

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const reload = useCallback(() => {
    const { from, to } = rangeFor(view, anchor)
    return load(from, to)
  }, [view, anchor, load])

  const typeById = useMemo(() => new Map(data.types.map((type) => [type.id, type])), [data.types])
  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>()
    for (const holiday of data.holidays) if (holiday.isDayOff && !map.has(holiday.date)) map.set(holiday.date, holiday.name)
    return map
  }, [data.holidays])

  const eventsOn = useCallback(
    (day: string) =>
      data.events
        .filter((event) => covers(event, day) && !hidden.has(event.typeId) && (!mineOnly || event.userId === actor.id))
        .sort((a, b) => {
          const ta = typeById.get(a.typeId)
          const tb = typeById.get(b.typeId)
          return (
            KIND_ORDER[ta?.kind ?? 'other'] - KIND_ORDER[tb?.kind ?? 'other'] ||
            (ta?.sortOrder ?? 0) - (tb?.sortOrder ?? 0) ||
            a.typeId.localeCompare(b.typeId) ||
            DAY_PART_ORDER[a.dayPart] - DAY_PART_ORDER[b.dayPart] ||
            a.userName.localeCompare(b.userName, 'th')
          )
        }),
    [data.events, hidden, mineOnly, actor.id, typeById],
  )

  const monthKey = anchor.slice(0, 7)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const first = `${monthKey}-01`
    const last = addDays(`${addMonths(monthKey, 1)}-01`, -1)
    for (const event of data.events) if (event.startDate <= last && event.endDate >= first) counts.set(event.typeId, (counts.get(event.typeId) ?? 0) + 1)
    return counts
  }, [data.events, monthKey])

  /* staffing count ignores the on-screen filters */
  const awayCount = useMemo(() => {
    const away = new Set<string>()
    for (const event of data.events) {
      if (covers(event, anchor) && event.dayPart === 'full' && typeById.get(event.typeId)?.kind === 'leave') away.add(event.userId)
    }
    return away.size
  }, [data.events, anchor, typeById])

  function shift(direction: 1 | -1) {
    if (view === 'month') go(view, `${addMonths(monthKey, direction)}-01`)
    else go(view, addDays(anchor, view === 'week' ? 7 * direction : direction))
  }

  function openNew(date: string) {
    const firstType = data.types.find((type) => type.isActive)
    setEntry({ id: null, typeId: firstType?.id ?? '', userId: actor.id, startDate: date, endDate: date, dayPart: 'full', title: '', note: '' })
  }

  function openExisting(event: CalendarEvent) {
    setEntry({ id: event.id, typeId: event.typeId, userId: event.userId, startDate: event.startDate, endDate: event.endDate, dayPart: event.dayPart, title: event.title ?? '', note: event.note ?? '' })
  }

  function goToDay(day: string) {
    go('day', day)
  }

  const defaultNewDate = view === 'month' && monthKey !== today.slice(0, 7) ? `${monthKey}-01` : view === 'day' ? anchor : today
  const views: { key: CalendarViewMode; label: string }[] = [
    ...(isMobile ? [] : [{ key: 'month' as const, label: 'เดือน' }]),
    { key: 'week', label: 'สัปดาห์' },
    { key: 'day', label: 'วัน' },
  ]
  // A closed calendar (Admins can still open one) is read-only.
  const activeTypes = calendar?.isActive === false ? [] : data.types.filter((type) => type.isActive)
  const switchable = data.calendars.length > 1 || isAdmin
  const allShown = activeTypes.every((type) => !hidden.has(type.id))

  return (
    <div className="cal mx-auto max-w-[1500px] space-y-4">
      <PageHeader
        eyebrow="Team Calendar"
        title={!calendar || calendar.isDefault ? 'ปฏิทิน / Calendar' : calendar.name}
        description={!calendar || calendar.isDefault ? 'ลา · เวรเจาะเลือด · วันหยุดของทีม' : 'วันหยุดราชการใช้ร่วมกับปฏิทินทีม'}
        actions={
          <Button className="hidden md:inline-flex" onClick={() => openNew(defaultNewDate)} disabled={!activeTypes.length}>
            <Plus className="size-4" /> ลงรายการ / Add
          </Button>
        }
      />

      {switchable ? (
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <div role="tablist" aria-label="เลือกปฏิทิน" className="inline-flex flex-none gap-1 rounded-[10px] border border-[#d6e2e3] bg-[#f4f8f7] p-[3px]">
            {data.calendars.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === data.calendarId}
                onClick={() => switchCalendar(item.id)}
                style={{ '--c': COLOR_HEX[item.colorKey] } as React.CSSProperties}
                className={`inline-flex min-h-[34px] flex-none items-center gap-2 rounded-[7px] px-3.5 text-sm font-semibold whitespace-nowrap transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${item.id === data.calendarId ? 'bg-white text-[#173d50] shadow-sm' : 'text-[#6a838c] hover:text-[#173d50]'} ${item.isActive ? '' : 'opacity-60'}`}
              >
                <i className="inline-block size-2.5 rounded-full bg-[var(--c)]" aria-hidden />
                {item.name}
                {item.isActive ? null : <span className="text-[11px] font-normal">(ปิด)</span>}
              </button>
            ))}
          </div>
          {isAdmin ? (
            <Button variant="secondary" className="!min-h-10 flex-none max-md:!px-0 max-md:size-10" aria-label="จัดการปฏิทิน" title="จัดการปฏิทิน" onClick={() => setDialog('calendars')}>
              <Layers className="size-4" /><span className="max-md:hidden">จัดการปฏิทิน</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div role="toolbar" aria-label="ควบคุมปฏิทิน" className="flex flex-wrap items-center gap-2.5">
        <h2 aria-live="polite" className="order-first basis-full text-base font-bold text-[#173d50] md:order-none md:basis-auto md:text-lg">
          {periodLabel(view, anchor)}
        </h2>
        <div className="flex items-center gap-1.5 md:order-first">
          <Button variant="secondary" className="!px-0 size-10 !min-h-10" aria-label="ก่อนหน้า" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" className="!min-h-10" onClick={() => go(view, today)}>วันนี้</Button>
          <Button variant="secondary" className="!px-0 size-10 !min-h-10" aria-label="ถัดไป" onClick={() => shift(1)}><ChevronRight className="size-4" /></Button>
        </div>
        {loading ? <LoaderCircle className="size-4 animate-spin text-[#6a838c]" aria-label="กำลังโหลด" /> : null}
        <div className="flex-1" />
        <div role="group" aria-label="มุมมอง" className="inline-flex rounded-[10px] border border-[#d6e2e3] bg-[#f4f8f7] p-[3px]">
          {views.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => go(key, anchor)}
              className={`min-h-[34px] rounded-[7px] px-3.5 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${view === key ? 'bg-white text-[#173d50] shadow-sm' : 'text-[#6a838c] hover:text-[#173d50]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="secondary" className="!min-h-10 max-md:!px-0 max-md:size-10" aria-label="เพิ่มลงปฏิทินมือถือ" title="เพิ่มลงปฏิทินมือถือ" onClick={() => setDialog('subscribe')}>
          <Smartphone className="size-4" /><span className="max-md:hidden">ลงมือถือ</span>
        </Button>
        {isAdmin ? (
          <>
            <Button variant="secondary" className="!min-h-10 max-md:!px-0 max-md:size-10" aria-label="จัดการประเภท" title="จัดการประเภท" onClick={() => setDialog('types')}>
              <Tags className="size-4" /><span className="max-md:hidden">ประเภท</span>
            </Button>
            <Button variant="secondary" className="!min-h-10 max-md:!px-0 max-md:size-10" aria-label="วันหยุด" title="วันหยุด" onClick={() => setDialog('holidays')}>
              <Settings2 className="size-4" /><span className="max-md:hidden">วันหยุด</span>
            </Button>
          </>
        ) : null}
      </div>

      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:flex-wrap">
        {activeTypes.length > 1 ? (
          <button
            type="button"
            className="cal-filter"
            style={{ '--c': COLOR_HEX.slate } as React.CSSProperties}
            aria-pressed={allShown}
            title={allShown ? 'ซ่อนทุกประเภท' : 'แสดงทุกประเภท'}
            onClick={() => setHidden(allShown ? new Set(activeTypes.map((type) => type.id)) : new Set())}
          >
            ทั้งหมด
          </button>
        ) : null}
        {activeTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            className="cal-filter"
            style={colorStyle(type)}
            aria-pressed={!hidden.has(type.id)}
            onClick={() =>
              setHidden((current) => {
                const next = new Set(current)
                if (next.has(type.id)) next.delete(type.id)
                else next.add(type.id)
                return next
              })
            }
          >
            <CalendarIcon iconKey={type.iconKey} />
            {type.name}
            <span className="mono text-xs opacity-75">{typeCounts.get(type.id) ?? 0}</span>
          </button>
        ))}
        <label className="ml-auto inline-flex min-h-[34px] flex-none items-center gap-2 pl-2 text-[13px] text-[#6a838c]">
          <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} className="size-4 accent-[#0b7f76]" />
          เฉพาะของฉัน
        </label>
      </div>

      {error ? (
        <Notice tone="danger">
          {error} <button type="button" className="font-semibold underline" onClick={() => void reload()}>ลองอีกครั้ง</button>
        </Notice>
      ) : null}
      {calendar?.isActive === false ? (
        <Notice tone="warning">ปฏิทินนี้ถูกปิดใช้งาน ดูได้อย่างเดียว เปิดใช้งานอีกครั้งได้ที่ “จัดการปฏิทิน”</Notice>
      ) : !activeTypes.length ? (
        <Notice tone="warning">ยังไม่มีประเภทที่เปิดใช้งาน {isAdmin ? 'กด “ประเภท” เพื่อเพิ่ม' : 'ติดต่อ Admin'}</Notice>
      ) : null}

      <section className={`paper overflow-hidden rounded-lg transition-opacity ${loading ? 'opacity-70' : ''}`} aria-busy={loading}>
        {view === 'month' ? (
          <MonthGrid month={monthKey} today={today} eventsOn={eventsOn} typeById={typeById} holidayByDate={holidayByDate} actorId={actor.id} onAdd={openNew} onOpen={openExisting} onDay={goToDay} canAdd={activeTypes.length > 0} />
        ) : view === 'week' ? (
          <WeekAgenda anchor={anchor} today={today} eventsOn={eventsOn} typeById={typeById} holidayByDate={holidayByDate} actorId={actor.id} onAdd={openNew} onOpen={openExisting} canAdd={activeTypes.length > 0} />
        ) : (
          <DayView anchor={anchor} today={today} eventsOn={eventsOn} typeById={typeById} holidayByDate={holidayByDate} actorId={actor.id} onAdd={openNew} onOpen={openExisting} onDay={goToDay} staffCount={data.users.length} awayCount={awayCount} canAdd={activeTypes.length > 0} />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[#6a838c]">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-3 rounded-[3px] border border-[#d6e2e3] bg-[var(--cal-we-bg)]" />เสาร์–อาทิตย์</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-3 rounded-[3px] border border-[#d6e2e3] bg-[var(--cal-hol-bg)]" />วันหยุดราชการ</span>
      </div>

      <button
        type="button"
        onClick={() => openNew(defaultNewDate)}
        disabled={!activeTypes.length}
        className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(92px+env(safe-area-inset-bottom))] z-30 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[#0b7f76] px-5 font-bold text-white shadow-[0_10px_24px_rgba(11,127,118,0.35)] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 md:hidden print:hidden"
      >
        <Plus className="size-5" /> ลงรายการ
      </button>

      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-[calc(160px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[10px] bg-[#173d50] px-4 py-2.5 text-sm font-semibold text-white shadow-lg md:bottom-8">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button type="button" className="font-bold text-[#7ee3d8]" onClick={() => { toast.undo?.(); setToast(null) }}>เลิกทำ</button>
          ) : null}
        </div>
      ) : null}

      <EntryDialog
        draft={entry}
        onClose={() => setEntry(null)}
        actor={actor}
        today={today}
        types={data.types}
        users={data.users}
        onSaved={async (saved, isNew) => {
          setEntry(null)
          const range = rangeFor(view, saved.startDate)
          setAnchor(saved.startDate)
          await load(range.from, range.to)
          setToast({ text: isNew ? 'บันทึกแล้ว' : 'บันทึกการแก้ไขแล้ว' })
        }}
        onDeleted={async (id) => {
          setEntry(null)
          await reload()
          setToast({
            text: 'ลบรายการแล้ว',
            undo: () => {
              void api(`/api/calendar/entries/${id}/restore`, { method: 'POST' })
                .then(() => reload())
                .then(() => setToast({ text: 'กู้คืนรายการแล้ว' }))
                .catch((undoError: Error) => setToast({ text: undoError.message }))
            },
          })
        }}
      />
      {isAdmin ? (
        <>
          {calendar ? (
            <TypeDialog open={dialog === 'types'} onClose={() => setDialog(null)} calendar={calendar} types={data.types} onChanged={(types) => setData((current) => ({ ...current, types }))} />
          ) : null}
          <CalendarBookDialog
            open={dialog === 'calendars'}
            onClose={() => setDialog(null)}
            calendars={data.calendars}
            onChanged={(calendars, createdId) => {
              setData((current) => ({ ...current, calendars }))
              if (createdId) {
                setDialog(null)
                switchCalendar(createdId)
                setToast({ text: 'เพิ่มปฏิทินแล้ว กด “ประเภท” เพื่อเพิ่มประเภทรายการ' })
              }
            }}
          />
          <HolidayDialog
            open={dialog === 'holidays'}
            onClose={() => setDialog(null)}
            syncedAt={data.holidaysSyncedAt}
            syncError={data.holidaysSyncError}
            onChanged={() => void reload()}
          />
        </>
      ) : null}
      {calendar ? <SubscribeDialog key={calendar.id} open={dialog === 'subscribe'} onClose={() => setDialog(null)} calendar={calendar} /> : null}
    </div>
  )
}

/* ---------- shared bits ---------- */

type ViewProps = {
  today: string
  eventsOn: (day: string) => CalendarEvent[]
  typeById: Map<string, CalendarType>
  holidayByDate: Map<string, string>
  actorId: string
  onAdd: (day: string) => void
  onOpen: (event: CalendarEvent) => void
  canAdd: boolean
}

function Chip({
  event,
  type,
  mine,
  onOpen,
  className = '',
  gridStyle,
  range = false,
}: {
  event: CalendarEvent
  type: CalendarType | undefined
  mine: boolean
  onOpen: (event: CalendarEvent) => void
  className?: string
  /** Placement when the chip is a bar in the month grid. */
  gridStyle?: React.CSSProperties
  /** Multi-day bar: name the whole range instead of the day part. */
  range?: boolean
}) {
  const part = event.dayPart === 'full' ? '' : DAY_PART_LABEL[event.dayPart]
  const when = range ? thaiRange(event.startDate, event.endDate) : DAY_PART_LABEL[event.dayPart]
  return (
    <button
      type="button"
      className={`cal-chip ${mine ? 'is-mine' : ''} ${className}`}
      style={{ ...colorStyle(type), ...gridStyle }}
      onClick={() => onOpen(event)}
      title={`${type?.name ?? ''}${event.title ? `: ${event.title}` : ''} · ${event.userName}${range ? ` · ${when}` : ''}${event.note ? ` — ${event.note}` : ''}`}
      aria-label={`${type?.name ?? 'รายการ'}${event.title ? ` ${event.title}` : ''} ${event.userName} ${when}`}
    >
      <CalendarIcon iconKey={type?.iconKey ?? 'star'} size={15} className="flex-none text-[var(--c)]" />
      <span className="min-w-0 truncate">
        <span className="font-semibold">{event.userName}</span>
        {event.title ? <span className="opacity-80"> · {event.title}</span> : null}
      </span>
      {part ? <span className="ml-auto flex-none text-[11px] opacity-80">{part}</span> : null}
    </button>
  )
}

function Row({ event, type, mine, onOpen }: { event: CalendarEvent; type: CalendarType | undefined; mine: boolean; onOpen: (event: CalendarEvent) => void }) {
  const tag = event.startDate !== event.endDate ? thaiRange(event.startDate, event.endDate) : DAY_PART_LABEL[event.dayPart]
  return (
    <button type="button" className="cal-row" style={colorStyle(type)} onClick={() => onOpen(event)}>
      <span className="cal-badge"><CalendarIcon iconKey={type?.iconKey ?? 'star'} size={20} /></span>
      <span className="grid min-w-0">
        <span className="text-sm font-semibold text-[#173d50]">
          {event.userName}{mine ? ' (ฉัน)' : ''}
        </span>
        <span className="truncate text-[12.5px] text-[#6a838c]">{event.title ? `${type?.name ?? 'ประเภทที่ถูกลบ'}: ${event.title}` : type?.name ?? 'ประเภทที่ถูกลบ'}{event.note ? ` · ${event.note}` : ''}</span>
      </span>
      <span className="cal-tag">{tag}</span>
    </button>
  )
}

function EmptyDay({ day, onAdd, canAdd, text = 'ไม่มีรายการ' }: { day: string; onAdd: (day: string) => void; canAdd: boolean; text?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-[13px] text-[#6a838c]">
      {text}
      {canAdd ? (
        <button type="button" onClick={() => onAdd(day)} className="rounded-md px-1.5 py-1 font-semibold text-[#0b7f76] hover:bg-[#e8f7f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
          + ลงรายการ
        </button>
      ) : null}
    </div>
  )
}

/* ---------- month ---------- */

/** Bar lanes shown per week; more multi-day entries fold into the day's "+N". */
const MAX_BAR_LANES = 3

function MonthGrid({ month, onDay, ...props }: ViewProps & { month: string; onDay: (day: string) => void }) {
  const { from, to } = monthGridRange(month)
  const days = eachDay(from, to)
  const weeks: string[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))
  return (
    <div>
      <div className="cal-grid border-b border-[#d6e2e3]">
        {THAI_DAYS.map((name, index) => (
          <div key={name} className={`cal-dow px-2.5 py-2 text-xs font-semibold text-[#6a838c] ${index === 0 || index === 6 ? 'is-weekend' : ''}`}>{name}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <MonthWeek key={week[0]} week={week} month={month} onDay={onDay} {...props} />
      ))}
    </div>
  )
}

function MonthWeek({ week, month, onDay, ...props }: ViewProps & { week: string[]; month: string; onDay: (day: string) => void }) {
  const lists = week.map((day) => props.eventsOn(day))
  // Multi-day entries become bars across the week; the rest stay chips in their day.
  const multiDay = [...new Map(lists.flat().filter((event) => event.startDate !== event.endDate).map((event) => [event.id, event])).values()]
  const { bars, lanes } = layoutWeekBars(multiDay, week[0])
  const shownLanes = Math.min(lanes, MAX_BAR_LANES)

  return (
    <div className="cal-week" style={{ gridTemplateRows: `auto${shownLanes ? ` repeat(${shownLanes}, auto)` : ''} 1fr` }}>
      {week.map((day, column) => {
        const holiday = props.holidayByDate.get(day)
        const state = [
          day.slice(0, 7) !== month ? 'is-outside' : '',
          isWeekend(day) ? 'is-weekend' : '',
          holiday ? 'is-holiday' : '',
          day === props.today ? 'is-today' : '',
        ].join(' ')
        const [, m, d] = day.split('-').map(Number)
        return (
          <div key={day} className={`cal-cell ${state} ${column === 6 ? 'is-last-col' : ''}`} style={{ gridColumn: column + 1, gridRow: '1 / -1' }}>
            {props.canAdd ? (
              <button type="button" className="cal-add-day absolute top-1.5 right-1.5" onClick={() => props.onAdd(day)} aria-label={`ลงรายการวันที่ ${d} ${THAI_MONTHS[m - 1]}`}>
                <Plus className="size-4" />
              </button>
            ) : null}
          </div>
        )
      })}

      {week.map((day, column) => {
        const holiday = props.holidayByDate.get(day)
        const state = [day.slice(0, 7) !== month ? 'is-outside' : '', isWeekend(day) ? 'is-weekend' : '', holiday ? 'is-holiday' : '', day === props.today ? 'is-today' : ''].join(' ')
        const [, m, d] = day.split('-').map(Number)
        return (
          <div key={`head-${day}`} className={`cal-week-head ${state}`} style={{ gridColumn: column + 1, gridRow: 1 }}>
            <button type="button" className="cal-dnum hover:ring-1 hover:ring-[#d6e2e3]" onClick={() => onDay(day)} aria-label={`ดูวันที่ ${d} ${THAI_MONTHS[m - 1]}`}>{d}</button>
          </div>
        )
      })}

      {bars
        .filter((bar) => bar.lane < shownLanes)
        .map((bar) => (
          <Chip
            key={bar.event.id}
            event={bar.event}
            type={props.typeById.get(bar.event.typeId)}
            mine={bar.event.userId === props.actorId}
            onOpen={props.onOpen}
            className={`cal-bar ${bar.continuesBefore ? 'continues-before' : ''} ${bar.continuesAfter ? 'continues-after' : ''}`}
            gridStyle={{ gridColumn: `${bar.column + 1} / span ${bar.span}`, gridRow: 2 + bar.lane }}
            range
          />
        ))}

      {week.map((day, column) => {
        const singles = lists[column].filter((event) => event.startDate === event.endDate)
        const holiday = props.holidayByDate.get(day)
        const covering = bars.filter((bar) => bar.column <= column && column < bar.column + bar.span)
        const hiddenBars = covering.filter((bar) => bar.lane >= shownLanes).length
        // Each day's list starts right under its own bars, so one day never pushes another down.
        const depth = Math.max(0, ...covering.filter((bar) => bar.lane < shownLanes).map((bar) => bar.lane + 1))
        const budget = Math.max(1, (holiday ? 3 : 4) - depth)
        const fits = singles.length <= budget && hiddenBars === 0
        const shown = fits ? singles : singles.slice(0, Math.max(0, budget - 1))
        const more = singles.length - shown.length + hiddenBars
        if (!holiday && !shown.length && !more) return null
        return (
          <div key={`list-${day}`} className="cal-week-list" style={{ gridColumn: column + 1, gridRow: `${2 + depth} / -1` }}>
            {holiday ? <div className="cal-holiday" title={holiday}><span>{holiday}</span></div> : null}
            {shown.map((event) => (
              <Chip key={event.id} event={event} type={props.typeById.get(event.typeId)} mine={event.userId === props.actorId} onOpen={props.onOpen} />
            ))}
            {more ? (
              <button type="button" className="cal-more" onClick={() => onDay(day)}>+{more} รายการ</button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- week ---------- */

function WeekAgenda({ anchor, ...props }: ViewProps & { anchor: string }) {
  const { from, to } = weekRange(anchor)
  return (
    <div>
      {eachDay(from, to).map((day) => {
        const list = props.eventsOn(day)
        const holiday = props.holidayByDate.get(day)
        const classes = ['cal-day-row', isWeekend(day) ? 'is-weekend' : '', holiday ? 'is-holiday' : '', day === props.today ? 'is-today' : ''].join(' ')
        return (
          <section key={day} className={classes} aria-label={`${THAI_DAYS[dayOfWeek(day)]} ${Number(day.slice(8))}`}>
            <div className="grid content-start">
              <span className="cal-day-num mono text-[22px] leading-tight font-medium">{Number(day.slice(8))}</span>
              <span className="text-xs font-semibold text-[#6a838c]">
                {THAI_DAYS[dayOfWeek(day)]}
                {day === props.today ? <span className="text-[#0b7f76]"> · วันนี้</span> : null}
              </span>
            </div>
            <div className="grid min-w-0 gap-1.5">
              {holiday ? <div className="cal-holiday text-xs"><span>{holiday}</span></div> : null}
              {list.length ? (
                list.map((event) => <Row key={event.id} event={event} type={props.typeById.get(event.typeId)} mine={event.userId === props.actorId} onOpen={props.onOpen} />)
              ) : (
                <EmptyDay day={day} onAdd={props.onAdd} canAdd={props.canAdd} />
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ---------- day ---------- */

function DayView({ anchor, onDay, staffCount, awayCount, ...props }: ViewProps & { anchor: string; onDay: (day: string) => void; staffCount: number; awayCount: number }) {
  const { from, to } = weekRange(anchor)
  const list = props.eventsOn(anchor)
  const holiday = props.holidayByDate.get(anchor)
  const groups = (['duty', 'leave', 'other'] as CalendarKind[])
    .map((kind) => [kind, list.filter((event) => (props.typeById.get(event.typeId)?.kind ?? 'other') === kind)] as const)
    .filter(([, items]) => items.length)

  return (
    <div>
      <div role="group" aria-label="เลือกวันในสัปดาห์" className="cal-strip grid grid-cols-7 gap-1 border-b border-[#d6e2e3] p-2.5">
        {eachDay(from, to).map((day) => {
          const colors = [...new Set(props.eventsOn(day).map((event) => props.typeById.get(event.typeId)?.colorKey ?? 'slate'))].slice(0, 4)
          return (
            <button
              key={day}
              type="button"
              onClick={() => onDay(day)}
              aria-current={day === anchor ? 'date' : undefined}
              aria-label={`${THAI_DAYS[dayOfWeek(day)]} ${Number(day.slice(8))}`}
              className={`${isWeekend(day) ? 'is-weekend' : ''} ${props.holidayByDate.has(day) ? 'is-holiday' : ''} hover:bg-[#f4f8f7]`}
            >
              <span className="text-[11px] font-semibold opacity-80">{THAI_DAYS_SHORT[dayOfWeek(day)]}</span>
              <span className="mono text-base">{Number(day.slice(8))}</span>
              <span className="flex h-[5px] gap-0.5">
                {colors.map((color) => <i key={color} className="cal-dot" style={{ '--c': COLOR_HEX[color] } as React.CSSProperties} />)}
              </span>
            </button>
          )
        })}
      </div>
      {holiday || isWeekend(anchor) ? (
        <div className={`mx-3.5 mt-3.5 rounded-[9px] px-3 py-2.5 text-[13px] font-semibold ${holiday ? 'bg-[var(--cal-hol-bg)] text-[var(--cal-hol-ink)]' : 'bg-[var(--cal-we-bg)] text-[var(--cal-we-ink)]'}`}>
          {holiday ? `วันหยุดราชการ · ${holiday}` : `วัน${THAI_DAYS[dayOfWeek(anchor)]} · วันหยุดสุดสัปดาห์`}
        </div>
      ) : null}
      {groups.length ? (
        groups.map(([kind, items]) => (
          <div key={kind} className="grid gap-2 p-3.5">
            <h3 className="text-xs font-semibold tracking-[0.04em] text-[#6a838c]">{KIND_LABEL[kind]}</h3>
            {items.map((event) => <Row key={event.id} event={event} type={props.typeById.get(event.typeId)} mine={event.userId === props.actorId} onOpen={props.onOpen} />)}
          </div>
        ))
      ) : (
        <div className="p-3.5"><EmptyDay day={anchor} onAdd={props.onAdd} canAdd={props.canAdd} text="ยังไม่มีใครลงรายการวันนี้" /></div>
      )}
      <p className="border-t border-[#edf2f2] px-3.5 py-3 text-[13px] text-[#6a838c]">
        <CalendarDays className="mr-1.5 inline size-4 align-[-3px]" />
        อยู่ปฏิบัติงาน <b className="mono text-[#173d50]">{Math.max(0, staffCount - awayCount)}/{staffCount}</b> คน
      </p>
    </div>
  )
}
