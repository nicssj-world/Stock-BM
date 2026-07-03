import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { readJson, respond } from '@/lib/server/route'
import { revokeUserAccess, updateUserAccess } from '@/lib/server/users'

const schema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  genomicRole: z.enum(['Admin', 'CBH-Staff']).optional(),
  genomicActive: z.boolean().optional(),
  stockRole: z.enum(['Admin', 'Staff']).optional(),
  stockActive: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await updateUserAccess((await params).id, await readJson(request, schema), await requireStockAdmin())
    return { ok: true }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    await revokeUserAccess((await params).id, await requireStockAdmin())
    return { ok: true }
  })
}

