import { z } from 'zod'
import { requireSigningActor, requireStockAdmin } from '@/lib/server/auth'
import { clearMySignature, getMySigner, saveMySignature, setUserPosition } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

const putSchema = z.union([
  z.object({ signaturePng: z.string().max(400000) }).strict(),
  z.object({ position: z.string().max(200), userId: z.string().uuid().optional() }).strict(),
])

// Position and signature used on annual vendor evaluation reports. A person manages their own; an Admin can also set anyone's position.
export async function GET() {
  return respond(async () => ({ signer: await getMySigner(await requireSigningActor()) }))
}

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request, putSchema)
    if ('signaturePng' in body) {
      await saveMySignature(body.signaturePng, await requireSigningActor())
    } else {
      const actor = body.userId && body.userId !== (await requireSigningActor()).id ? await requireStockAdmin() : await requireSigningActor()
      await setUserPosition(body.userId ?? actor.id, body.position, actor)
    }
    return { ok: true }
  })
}

export async function DELETE() {
  return respond(async () => {
    await clearMySignature(await requireSigningActor())
    return { ok: true }
  })
}
