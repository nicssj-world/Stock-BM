import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { updateRoundReceipt } from '@/lib/server/eqa'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({
  planItemId: z.string().uuid(), externalSentDate: z.string().trim().nullable().optional(), sampleReceivedDate: z.string().trim().nullable().optional(),
  packageCondition: z.enum(['acceptable', 'unacceptable']).nullable().optional(), packageNote: z.string().trim().max(1000).nullable().optional(),
  receivedTemperature: z.enum(['refrigerated', 'room', 'other']).nullable().optional(), receivedTemperatureNote: z.string().trim().max(1000).nullable().optional(),
  sampleCondition: z.enum(['acceptable', 'unacceptable']).nullable().optional(), sampleConditionNote: z.string().trim().max(1000).nullable().optional(),
  storageCondition: z.enum(['refrigerated', 'room', 'other']).nullable().optional(), storageTemperatureC: z.number().finite().nullable().optional(), storageNote: z.string().trim().max(1000).nullable().optional(),
  specimenType: z.string().trim().max(200).nullable().optional(), receiverId: z.string().uuid().nullable().optional(), analystId: z.string().uuid().nullable().optional(),
  analysisDate: z.string().trim().nullable().optional(), submissionDate: z.string().trim().nullable().optional(), submissionMethod: z.string().trim().max(300).nullable().optional(), otherDetails: z.string().trim().max(3000).nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ eqa: await updateRoundReceipt((await params).id, await readJson(request, schema), await requireActor()) }))
}
