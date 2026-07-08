import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { logReading } from '@/lib/server/environment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  unitId: z.string().uuid(),
  readingValue: z.number(),
  humidityPercent: z.number().min(0).max(100).nullable().optional(),
  recordedMin: z.number().nullable().optional(),
  recordedMax: z.number().nullable().optional(),
  periodIndex: z.number().int().min(1).max(3).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ env: await logReading(await readJson(request, schema), await requireActor()) }))
}
