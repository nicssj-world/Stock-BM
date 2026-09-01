import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import {
  createRoutineMaintenanceForm,
  deactivateRoutineMaintenanceForm,
  deleteRoutineHoliday,
  deleteRoutineMaintenanceEntry,
  getRoutineWorkspace,
  logRoutineMaintenance,
  reviewRoutinePeriod,
  setRoutineHoliday,
  unlockRoutinePeriod,
  updateRoutineMaintenanceForm,
} from '@/lib/server/routine-maintenance'
import { readJson, respond } from '@/lib/server/route'
import { HttpError } from '@/lib/server/errors'

const frequency = z.enum(['daily', 'weekly', 'monthly', 'yearly'])
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const itemLabel = z.string().trim().min(1).max(500)
const formFields = {
  name: z.string().trim().min(1).max(200),
  frequency,
  startsOn: date,
  reviewerId: z.string().uuid().nullable().optional(),
  items: z.array(itemLabel).min(1).max(80),
  active: z.boolean().optional(),
}
const createFormSchema = z.object({ action: z.literal('create-form'), equipmentId: z.string().uuid(), ...formFields })
const updateFormSchema = z.object({ action: z.literal('update-form'), formId: z.string().uuid(), ...formFields })
const deactivateFormSchema = z.object({ action: z.literal('deactivate-form'), formId: z.string().uuid() })
const logSchema = z.object({
  action: z.literal('log'),
  formId: z.string().uuid(),
  versionId: z.string().uuid(),
  plannedOn: date,
  scheduledOn: date,
  taskResults: z.array(z.object({ itemId: z.string().uuid(), label: z.string().optional(), state: z.enum(['done', 'not-applicable', 'not-done']) })).min(1).max(80),
  note: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().uuid().nullable().optional(),
})
const holidaySchema = z.object({ action: z.literal('set-holiday'), formId: z.string().uuid(), date, note: z.string().trim().max(500).nullable().optional() })
const deleteHolidaySchema = z.object({ action: z.literal('delete-holiday'), formId: z.string().uuid(), date })
const reviewSchema = z.object({ action: z.literal('review'), formId: z.string().uuid(), frequency, period: z.string().regex(/^\d{4}(?:-\d{2})?$/) })
const unlockSchema = z.object({ action: z.literal('unlock'), formId: z.string().uuid(), frequency, period: z.string().regex(/^\d{4}(?:-\d{2})?$/) })
const deleteEntrySchema = z.object({ action: z.literal('delete-entry'), id: z.string().uuid() })
const schema = z.discriminatedUnion('action', [
  createFormSchema,
  updateFormSchema,
  deactivateFormSchema,
  logSchema,
  holidaySchema,
  deleteHolidaySchema,
  reviewSchema,
  unlockSchema,
  deleteEntrySchema,
])

export async function GET(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const equipmentId = new URL(request.url).searchParams.get('equipmentId')
    if (!equipmentId) throw new HttpError(400, 'ต้องระบุเครื่องมือ')
    return { workspace: await getRoutineWorkspace(actor, equipmentId) }
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const body = await readJson(request, schema)
    const workspace = body.action === 'create-form' ? await createRoutineMaintenanceForm(body, actor)
      : body.action === 'update-form' ? await updateRoutineMaintenanceForm(body, actor)
      : body.action === 'deactivate-form' ? await deactivateRoutineMaintenanceForm(body.formId, actor)
      : body.action === 'log' ? await logRoutineMaintenance({ ...body, source: 'internal' }, actor)
      : body.action === 'set-holiday' ? await setRoutineHoliday(body.formId, body.date, body.note ?? null, actor)
      : body.action === 'delete-holiday' ? await deleteRoutineHoliday(body.formId, body.date, actor)
      : body.action === 'review' ? await reviewRoutinePeriod(body, actor)
      : body.action === 'unlock' ? await unlockRoutinePeriod(body, actor)
      : await deleteRoutineMaintenanceEntry(body.id, actor)
    return { workspace }
  })
}
