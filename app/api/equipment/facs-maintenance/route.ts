import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteFacsMaintenanceEntry, getFacsMaintenanceWorkspace, logFacsMaintenance, reviewFacsPeriod, setFacsHoliday, setFacsReviewer, unlockFacsPeriod } from '@/lib/server/facs-maintenance'
import { readJson, respond } from '@/lib/server/route'

const frequency = z.enum(['daily', 'monthly'])
const task = z.object({ state: z.enum(['done', 'not-applicable', 'not-done']), note: z.string().trim().max(500).optional() })
const logSchema = z.object({ action: z.literal('log'), frequency, performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), taskResults: z.array(task).min(1).max(8), note: z.string().trim().max(2000).nullable().optional() })
const reviewerSchema = z.object({ action: z.literal('set-reviewer'), reviewerId: z.string().uuid() })
const holidaySchema = z.object({ action: z.literal('set-holiday'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).nullable().optional() })
const reviewSchema = z.object({ action: z.literal('review'), frequency, period: z.string().regex(/^\d{4}(-\d{2})?$/) })
const unlockSchema = z.object({ action: z.literal('unlock'), frequency, period: z.string().regex(/^\d{4}(-\d{2})?$/) })
const deleteSchema = z.object({ action: z.literal('delete'), id: z.string().uuid() })
const schema = z.discriminatedUnion('action', [logSchema, reviewerSchema, holidaySchema, reviewSchema, unlockSchema, deleteSchema])

export async function GET() { return respond(async () => ({ maintenance: await getFacsMaintenanceWorkspace(await requireActor()) })) }
export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor(); const body = await readJson(request, schema)
    const maintenance = body.action === 'log' ? await logFacsMaintenance(body, actor)
      : body.action === 'set-reviewer' ? await setFacsReviewer(body.reviewerId, actor)
      : body.action === 'set-holiday' ? await setFacsHoliday(body.date, body.note ?? null, actor)
      : body.action === 'review' ? await reviewFacsPeriod(body.frequency, body.period, actor)
      : body.action === 'unlock' ? await unlockFacsPeriod(body.frequency, body.period, actor)
      : await deleteFacsMaintenanceEntry(body.id, actor)
    return { maintenance }
  })
}
