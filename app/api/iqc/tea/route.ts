import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createTeaSpec } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  analyteId: z.string().uuid(),
  teaValue: z.number().positive(),
  teaMode: z.enum(['absolute', 'percent']),
  teaUnit: z.string().trim().max(40).nullable().optional(),
  sourceRef: z.string().trim().max(300).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createTeaSpec(await readJson(request, schema), await requireActor()) }))
}
