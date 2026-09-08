import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createResponseSet, deleteResponseSet, getResponseSetsCatalog, updateResponseSet } from '@/lib/server/routine-maintenance'
import { readJson, respond } from '@/lib/server/route'

const option = z.object({
  id: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(200),
  mark: z.string().trim().min(1).max(10),
})
const options = z.array(option).min(1).max(20)
const createSchema = z.object({ action: z.literal('create-set'), name: z.string().trim().min(1).max(200), options })
const updateSchema = z.object({ action: z.literal('update-set'), id: z.string().uuid(), name: z.string().trim().min(1).max(200), active: z.boolean(), options })
const deleteSchema = z.object({ action: z.literal('delete-set'), id: z.string().uuid() })
const schema = z.discriminatedUnion('action', [createSchema, updateSchema, deleteSchema])

export async function GET() {
  return respond(async () => {
    await requireActor()
    return getResponseSetsCatalog()
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const body = await readJson(request, schema)
    if (body.action === 'create-set') return createResponseSet(body, actor)
    if (body.action === 'update-set') return updateResponseSet(body, actor)
    return deleteResponseSet(body.id, actor)
  })
}
