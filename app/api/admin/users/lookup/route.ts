import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { respond } from '@/lib/server/route'
import { HttpError } from '@/lib/server/errors'
import { lookupUserByEphisId } from '@/lib/server/users'

const schema = z.string().trim().regex(/^\d+$/)

export async function GET(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const rawEphisId = new URL(request.url).searchParams.get('ephisId') ?? ''
    const parsed = schema.safeParse(rawEphisId)
    if (!parsed.success) throw new HttpError(400, 'Invalid E-Phis')
    return { user: await lookupUserByEphisId(parsed.data, actor) }
  })
}
