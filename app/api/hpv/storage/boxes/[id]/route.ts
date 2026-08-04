import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { closeHpvStorageBox, deleteHpvStorageBox, destroyHpvStorageBox, renameHpvStorageBox, reopenHpvStorageBox } from '@/lib/server/hpv'
import { readJson, respond } from '@/lib/server/route'

const patchSchema = z.object({
  action: z.enum(['close', 'destroy', 'reopen', 'rename']),
  boxCode: z.string().trim().min(1).max(80).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { action, boxCode } = await readJson(request, patchSchema)
    const id = (await params).id
    const actor = await requireStockAdmin()
    if (action === 'destroy') return { workspace: await destroyHpvStorageBox(id, actor) }
    if (action === 'reopen') return { workspace: await reopenHpvStorageBox(id, actor) }
    if (action === 'rename') {
      if (!boxCode) throw new HttpError(400, 'ระบุชื่อกล่อง')
      return { workspace: await renameHpvStorageBox(id, boxCode, actor) }
    }
    return { workspace: await closeHpvStorageBox(id, actor) }
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => ({ workspace: await deleteHpvStorageBox((await params).id, await requireStockAdmin()) }))
}
