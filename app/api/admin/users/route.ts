import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { createOrGrantUser, listUsers } from '@/lib/server/users'

const schema = z.object({
  ephisId: z.string().regex(/^\d+$/),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  stockRole: z.enum(['Admin', 'Staff', 'Assistant']),
  genomicRole: z.enum(['Admin', 'CBH-Staff']).optional(),
})

export async function GET() {
  return respond(async () => {
    await requireStockAdmin()
    return { users: await listUsers() }
  })
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    return { id: await createOrGrantUser(await readJson(request, schema), actor) }
  })
}
