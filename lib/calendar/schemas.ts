import { z } from 'zod'
import { isDateKey } from '@/lib/calendar/rules'
import { CALENDAR_COLORS, CALENDAR_KINDS, DAY_PARTS } from '@/lib/calendar/types'
import { CALENDAR_ICON_KEYS } from '@/lib/calendar/icon-keys'

export const dateKeySchema = z.string().refine(isDateKey, 'วันที่ไม่ถูกต้อง')

export const entrySchema = z.object({
  typeId: z.string().uuid('เลือกประเภท'),
  userId: z.string().uuid(),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  dayPart: z.enum(DAY_PARTS),
  title: z.string().trim().max(80, 'หัวข้อยาวเกิน 80 ตัวอักษร').nullish().transform((value) => value || null),
  note: z.string().trim().max(300, 'หมายเหตุยาวเกิน 300 ตัวอักษร').nullable().transform((value) => value || null),
})

export const typeSchema = z.object({
  /** Only read when creating; a type never moves to another calendar. */
  calendarId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'ใส่ชื่อประเภท').max(40, 'ชื่อยาวเกิน 40 ตัวอักษร'),
  iconKey: z.enum(CALENDAR_ICON_KEYS),
  colorKey: z.enum(CALENDAR_COLORS),
  kind: z.enum(CALENDAR_KINDS),
  inLineDigest: z.boolean(),
  requiresTitle: z.boolean().default(false),
  isActive: z.boolean(),
})

export const manualHolidaySchema = z.object({
  date: dateKeySchema,
  name: z.string().trim().min(1, 'ใส่ชื่อวันหยุด').max(80, 'ชื่อยาวเกิน 80 ตัวอักษร'),
})

export const calendarSchema = z.object({
  name: z.string().trim().min(1, 'ใส่ชื่อปฏิทิน').max(40, 'ชื่อยาวเกิน 40 ตัวอักษร'),
  colorKey: z.enum(CALENDAR_COLORS),
  lineGroupId: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || /^[A-Za-z0-9]{10,64}$/.test(value), 'LINE group ID ไม่ถูกต้อง'),
  isActive: z.boolean(),
})
