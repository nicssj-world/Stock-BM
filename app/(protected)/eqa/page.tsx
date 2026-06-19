import { EqaView } from '@/components/eqa-view'
import { requirePageActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'

export default async function EqaPage() {
  const actor = await requirePageActor()
  return <EqaView actor={actor} initialData={await getEqaWorkspace(actor)} />
}
