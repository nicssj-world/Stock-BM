import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteScheme, setEqaEntityActive, updateScheme } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ isActive: z.boolean().optional(), providerId: z.string().uuid().optional(), name: z.string().trim().min(1).max(200).optional(), code: z.string().trim().max(80).nullable().optional(), analyteScope: z.string().trim().max(500).nullable().optional(), roundsPerYear: z.number().int().positive().nullable().optional() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => { const body = await readJson(request, schema); const id = (await params).id; return { eqa: body.name !== undefined && body.providerId ? await updateScheme(id, body as Required<Pick<typeof body, 'providerId' | 'name'>> & typeof body, await requireActor()) : await setEqaEntityActive('scheme', id, Boolean(body.isActive), await requireActor()) } })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return respond(async () => ({ eqa: await deleteScheme((await params).id, await requireActor()) })) }
