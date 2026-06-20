import { LotVerificationView } from '@/components/lot-verification-view'
import { requirePageActor } from '@/lib/server/auth'
import { getLotVerifWorkspace } from '@/lib/server/lotverif'

export default async function LotVerificationPage() {
  const actor = await requirePageActor()
  return <LotVerificationView actor={actor} initialData={await getLotVerifWorkspace(actor)} />
}
