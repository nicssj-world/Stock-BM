import { requireActor } from '@/lib/server/auth'
import { createInstCompStudy } from '@/lib/server/instcomp'
import { readJson, respond } from '@/lib/server/route'
import { studySchema } from '@/lib/instcomp/schema'

export async function POST(request: Request) {
  return respond(async () => ({ id: await createInstCompStudy(await readJson(request, studySchema), await requireActor()) }))
}
