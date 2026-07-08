import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteProvider, setEqaEntityActive } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ isActive: z.boolean() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await setEqaEntityActive('provider', (await params).id, (await readJson(request, schema)).isActive, await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await deleteProvider((await params).id, await requireActor()) }))
}
