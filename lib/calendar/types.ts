/** Swatch order in the type editor: roughly by hue. */
export const CALENDAR_COLORS = ['teal', 'cyan', 'sky', 'indigo', 'violet', 'pink', 'rose', 'red', 'orange', 'amber', 'brown', 'lime', 'green', 'slate'] as const
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

export const CALENDAR_KINDS = ['duty', 'leave', 'other'] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const DAY_PARTS = ['full', 'am', 'pm'] as const
export type DayPart = (typeof DAY_PARTS)[number]

/** One calendar (the default team calendar or one an Admin added). */
export interface CalendarBook {
  id: string
  name: string
  colorKey: CalendarColor
  /** Admin-only: LINE group the heads-up goes to; null = the default group. Blank for non-Admins. */
  lineGroupId: string | null
  isDefault: boolean
  isActive: boolean
  sortOrder: number
}

export interface CalendarType {
  id: string
  calendarId: string
  name: string
  iconKey: string
  colorKey: CalendarColor
  kind: CalendarKind
  inLineDigest: boolean
  /** Entries of this type must carry a title (shown in the calendar, LINE and the phone feed). */
  requiresTitle: boolean
  /** False for a lab-wide type (e.g. an OT shift): its entries have no person. */
  requiresUser: boolean
  sortOrder: number
  isActive: boolean
  usageCount: number
}

export interface CalendarEvent {
  id: string
  calendarId: string
  typeId: string
  /** Null for an entry of a type without a person. */
  userId: string | null
  userName: string | null
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
  /** The calendar shown; `calendars` lists every one the switcher offers (inactive ones only for Admins). */
  calendarId: string
  calendars: CalendarBook[]
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
