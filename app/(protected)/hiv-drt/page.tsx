import { HivDrtView } from '@/components/hiv-drt-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getHivDrtWorkspace } from '@/lib/server/hiv-drt'

export default async function HivDrtPage() {
  const actor = await requireFullPageActor()
  const workspace = await getHivDrtWorkspace(actor)
  return <HivDrtView actor={actor} initialData={workspace} />
}
