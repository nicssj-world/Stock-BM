import { requireStockAdmin } from '@/lib/server/auth'
import { cancelHpvDistribution } from '@/lib/server/hpv'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const url = new URL(request.url)
    const reason = url.searchParams.get('reason')?.trim() ?? ''
    if (!reason) throw new HttpError(400, 'กรุณาระบุเหตุผลในการยกเลิก')
    return { workspace: await cancelHpvDistribution((await params).id, reason, await requireStockAdmin()) }
  })
}
