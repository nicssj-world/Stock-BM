import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteProvider, setEqaEntityActive, updateProvider } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ isActive: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => { const body = await readJson(request, schema); const id = (await params).id; return { eqa: body.name ? await updateProvider(id, { name: body.name }, await requireActor()) : await setEqaEntityActive('provider', id, Boolean(body.isActive), await requireActor()) } })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await deleteProvider((await params).id, await requireActor()) }))
}
