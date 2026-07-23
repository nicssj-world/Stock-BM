import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createEquipment } from '@/lib/server/equipment'
import { readJson, respond } from '@/lib/server/route'

export const equipmentSchema = z.object({
  code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200), category: z.string().trim().max(120).nullable().optional(), manufacturer: z.string().trim().max(160).nullable().optional(), model: z.string().trim().max(160).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(), assetNumber: z.string().trim().max(160).nullable().optional(), location: z.string().trim().max(200).nullable().optional(), installedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), warrantyUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'maintenance', 'out_of_service', 'decommissioned']).optional(), note: z.string().trim().max(2000).nullable().optional(),
})
export async function POST(request: Request) { return respond(async () => ({ workspace: await createEquipment(await readJson(request, equipmentSchema), await requireActor()) })) }
