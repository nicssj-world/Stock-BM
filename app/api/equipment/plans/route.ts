import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { createEquipmentPlan } from '@/lib/server/equipment'
import { readJson, respond } from '@/lib/server/route'

export const planSchema = z.object({ equipmentId: z.string().uuid(), activityType: z.enum(['pm', 'calibration', 'verification', 'qualification', 'inspection_safety']), title: z.string().trim().min(1).max(200), intervalValue: z.number().int().min(1).max(3650), intervalUnit: z.enum(['day', 'week', 'month', 'year']), scheduleBasis: z.enum(['completion_based', 'fixed_schedule']), nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reminderDays: z.number().int().min(0).max(3650).optional(), vendor: z.string().trim().max(200).nullable().optional(), instruction: z.string().trim().max(2000).nullable().optional(), isActive: z.boolean().optional() })
export async function POST(request: Request) { return respond(async () => ({ workspace: await createEquipmentPlan(await readJson(request, planSchema), await requireActor()) })) }
