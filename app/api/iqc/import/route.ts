import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { importIqcRuns } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlLotId: z.string().uuid(),
  analyteIds: z.array(z.string().uuid()).min(1),
  trucountLot: z.string().trim().max(80).nullable().optional(),
  rows: z
    .array(
      z.object({
        runDatetime: z.string().min(1),
        values: z.array(z.number().nullable()),
      }),
    )
    .min(1)
    .max(2000),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await importIqcRuns(await readJson(request, schema), await requireActor()) }))
}
