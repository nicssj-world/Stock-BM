import { requireActor } from '@/lib/server/auth'
import { createMethodVerifSchema } from '@/lib/methodverif/schema'
import { createMethodVerifStudy } from '@/lib/server/methodverif'
import { readJson, respond } from '@/lib/server/route'

export async function POST(request: Request) {
  return respond(async () => ({ id: await createMethodVerifStudy(await readJson(request, createMethodVerifSchema), await requireActor()) }))
}
