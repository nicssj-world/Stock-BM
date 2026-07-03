import { HpvView } from '@/components/hpv-view'
import { requirePageActor } from '@/lib/server/auth'
import { getHpvWorkspace } from '@/lib/server/hpv'

export default async function HpvPage() {
  const actor = await requirePageActor()
  const workspace = await getHpvWorkspace(actor)
  return <HpvView actor={actor} initialData={workspace} />
}
