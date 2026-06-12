import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { resetUserPassword } from '@/lib/server/users'

const schema = z.object({ password: z.string().min(8).max(128) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await resetUserPassword((await params).id, (await readJson(request, schema)).password, await requireStockAdmin())
    return { ok: true }
  })
}

