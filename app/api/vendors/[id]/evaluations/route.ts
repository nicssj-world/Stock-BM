import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { createAnnualDraft } from '@/lib/server/vendor-evaluation'
import { readJson, respond } from '@/lib/server/route'

const createSchema = z.object({ fiscalYear: z.number().int().min(2500).max(3000) }).strict()

// Opens (or returns) the draft annual report of a vendor for a fiscal year (Buddhist era).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const { fiscalYear } = await readJson(request, createSchema)
    return { revisionId: await createAnnualDraft((await params).id, fiscalYear, actor) }
  })
}
