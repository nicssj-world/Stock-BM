import { z } from 'zod'
import { requireStockOperator } from '@/lib/server/auth'
import { clearMySignature, getMySigner, saveMySignature } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

const putSchema = z.object({ signaturePng: z.string().max(400000) }).strict()

// The signed-in user's own saved signature, reused when they sign EQA
// documents, equipment work records and vendor evaluation reports. Only the
// owner can read or change it; the database validates the PNG.
export async function GET() {
  return respond(async () => {
    const signer = await getMySigner(await requireStockOperator())
    return { signature: signer.signature }
  })
}

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request, putSchema)
    await saveMySignature(body.signaturePng, await requireStockOperator())
    return { ok: true }
  })
}

export async function DELETE() {
  return respond(async () => {
    await clearMySignature(await requireStockOperator())
    return { ok: true }
  })
}
