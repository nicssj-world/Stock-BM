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
