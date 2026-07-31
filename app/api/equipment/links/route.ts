import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createEquipmentLink } from '@/lib/server/equipment'
import { readJson, respond } from '@/lib/server/route'

const schema = z.object({ equipmentId: z.string().uuid(), module: z.enum(['iqc', 'eqa']), entityId: z.string().uuid().optional() }).refine((value) => value.module === 'iqc' || Boolean(value.entityId), { message: 'กรุณาเลือกรายการปลายทาง', path: ['entityId'] })
export async function POST(request: Request) { return respond(async () => ({ workspace: await createEquipmentLink(await readJson(request, schema), await requireActor()) })) }
