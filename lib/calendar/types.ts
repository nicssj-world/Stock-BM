export const CALENDAR_COLORS = ['teal', 'rose', 'amber', 'sky', 'violet', 'green', 'orange', 'slate'] as const
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

export const CALENDAR_KINDS = ['duty', 'leave', 'other'] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const DAY_PARTS = ['full', 'am', 'pm'] as const
export type DayPart = (typeof DAY_PARTS)[number]

export interface CalendarType {
  id: string
  name: string
  iconKey: string
  colorKey: CalendarColor
  kind: CalendarKind
  inLineDigest: boolean
  /** Entries of this type must carry a title (shown in the calendar, LINE and the phone feed). */
  requiresTitle: boolean
  sortOrder: number
  isActive: boolean
  usageCount: number
}

export interface CalendarEvent {
  id: string
  typeId: string
  userId: string
  userName: string
  startDate: string
  endDate: string
  dayPart: DayPart
  title: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CalendarHoliday {
  id: string
  date: string
  name: string
  source: 'google' | 'manual'
  isDayOff: boolean
  isObservance: boolean
}

export interface CalendarUser {
  id: string
  displayName: string
}

export interface CalendarWorkspace {
  from: string
  to: string
  today: string
  types: CalendarType[]
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  users: CalendarUser[]
  holidaysSyncedAt: string | null
  holidaysSyncError: string | null
}

export interface CalendarHistoryEntry {
  at: string
  actorName: string
  action: 'create' | 'update' | 'delete'
  changes: string[]
}

export interface CalendarTodaySummary {
  date: string
  holidayName: string | null
  isWeekend: boolean
  duty: { typeName: string; iconKey: string; colorKey: CalendarColor; people: string[] }[]
  away: { name: string; typeName: string; iconKey: string; colorKey: CalendarColor; dayPart: DayPart }[]
  presentCount: number
  staffCount: number
}
