import { CalendarView, type CalendarViewMode } from '@/components/calendar/calendar-view'
import { Notice, PageHeader } from '@/components/ui'
import { todayBangkok } from '@/lib/bm/rules'
import { isDateKey, monthGridRange, weekRange } from '@/lib/calendar/rules'
import { requireFullPageActor } from '@/lib/server/auth'
import { getCalendarWorkspace } from '@/lib/server/calendar'

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const actor = await requireFullPageActor()
  const params = await searchParams
  const view: CalendarViewMode = params.view === 'week' || params.view === 'day' ? params.view : 'month'
  const date = params.date && isDateKey(params.date) ? params.date : todayBangkok()
  const range = view === 'month' ? monthGridRange(date.slice(0, 7)) : weekRange(date)

  let workspace
  try {
    workspace = await getCalendarWorkspace(range.from, range.to)
  } catch (error) {
    // Most likely the calendar migration has not been applied yet.
    return (
      <div className="mx-auto max-w-[1500px] space-y-4">
        <PageHeader eyebrow="Team Calendar" title="ปฏิทิน / Calendar" description="ลา · เวรเจาะเลือด · วันหยุดของทีม" />
        <Notice tone="warning">
          ปฏิทินยังใช้งานไม่ได้ ระบบโหลดข้อมูลไม่สำเร็จ ({error instanceof Error ? error.message : 'unknown error'})
          {actor.role === 'Admin' ? ' ตรวจว่าได้ apply migration 20261119000100_bm_team_calendar.sql แล้ว' : ' แจ้ง Admin'}
        </Notice>
      </div>
    )
  }
  return <CalendarView actor={actor} initialData={workspace} initialView={view} initialDate={date} />
}
