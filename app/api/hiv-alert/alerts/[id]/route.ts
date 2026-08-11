import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { deleteHivLabAlert, updateHivLabAlert } from '@/lib/server/hiv-lab-alert'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  hn: z.string().trim().min(1).max(80).optional(),
  patientName: z.string().trim().min(1).max(200).optional(),
}).refine((value) => value.hn !== undefined || value.patientName !== undefined, 'ต้องมีข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ')

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await updateHivLabAlert((await params).id, await readJson(request, patchSchema), await requireActor()) }))
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHivLabAlert((await params).id, await requireActor()) }))
}
