import { requireActor } from '@/lib/server/auth'
import { createPlanItem } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'
import { eqaPlanItemSchema } from '@/lib/eqa/api-schemas'

export async function POST(request: Request) {
  return respond(async () => ({ eqa: await createPlanItem(await readJson(request, eqaPlanItemSchema), await requireActor()) }))
}
