import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createAnalyte } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  dataType: z.enum(['quantitative', 'qualitative']),
  scale: z.enum(['linear', 'log10']),
  isAbsolute: z.boolean().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  groupLabel: z.string().trim().max(80).nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createAnalyte(await readJson(request, schema), await requireActor()) }))
}
