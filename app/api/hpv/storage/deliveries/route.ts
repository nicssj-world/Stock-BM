import { z } from 'zod'
import { requireActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { createHpvSampleDelivery } from '@/lib/server/hpv'
import { respond } from '@/lib/server/route'

// Multipart because the receiver's signature is posted as a PNG file alongside
// the handover details, so this route cannot use the shared readJson helper.
export const runtime = 'nodejs'

const schema = z.object({
  sampleIds: z.array(z.string().uuid()).min(1).max(200),
  destination: z.string().trim().max(200).nullable().optional(),
  receiverName: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === 'string' && value.trim() ? value : null
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor()
    const form = await request.formData()

    const signature = form.get('signature')
    if (!(signature instanceof File)) throw new HttpError(400, 'กรุณาลงลายเซ็นผู้รับตัวอย่าง')

    let sampleIds: unknown
    try {
      sampleIds = JSON.parse(String(form.get('sampleIds') ?? '[]'))
    } catch {
      throw new HttpError(400, 'รายการตัวอย่างไม่ถูกต้อง')
    }

    const input = schema.parse({
      sampleIds,
      destination: text(form, 'destination'),
      receiverName: text(form, 'receiverName'),
      note: text(form, 'note'),
    })
    return createHpvSampleDelivery({ ...input, signature }, actor)
  })
}
