import { EqaView } from '@/components/eqa-view'
import { EqaSignerView } from '@/components/eqa/signer-view'
import { requireSigningPageActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'

export default async function EqaPage() {
  const actor = await requireSigningPageActor()
  const data = await getEqaWorkspace(actor)
  // A Signer only reviews and signs the documents carrying their assigned roles.
  if (actor.role === 'Signer') return <EqaSignerView actor={actor} initialData={data} />
  return <EqaView actor={actor} initialData={data} />
}
