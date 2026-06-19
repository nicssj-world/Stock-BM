import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createControlLot } from '@/lib/server/iqc'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  controlMaterialId: z.string().uuid(),
  lotNumber: z.string().trim().min(1).max(80),
  expiryDate: z.string().trim().nullable().optional(),
  stockLotId: z.string().uuid().nullable().optional(),
})

export async function POST(request: Request) {
  return respond(async () => ({ iqc: await createControlLot(await readJson(request, schema), await requireActor()) }))
}
