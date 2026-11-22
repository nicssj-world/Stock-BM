import { requireActor } from '@/lib/server/auth'
import { updateMethodVerifSchema } from '@/lib/methodverif/schema'
import { deleteMethodVerifStudy, updateMethodVerifStudy } from '@/lib/server/methodverif'
import { readJson, respond } from '@/lib/server/route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await updateMethodVerifStudy((await params).id, await readJson(request, updateMethodVerifSchema), await requireActor())
    return { ok: true }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await deleteMethodVerifStudy((await params).id, await requireActor())
    return { ok: true }
  })
}
