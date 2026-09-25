import { z } from 'zod'
import { requireStockAdmin } from '@/lib/server/auth'
import { closeInvoiceShort } from '@/lib/server/receiving'
import { readJson, respond } from '@/lib/server/route'

const closeSchema = z.object({ reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลที่ปิดแบบรับไม่ครบ').max(1000) }).strict()

// Closes an open invoice with goods still outstanding (LABCBH "closed short"). A full receipt closes the invoice by itself.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireStockAdmin()
    const { reason } = await readJson(request, closeSchema)
    return { receiving: await closeInvoiceShort((await params).id, reason, actor) }
  })
}
