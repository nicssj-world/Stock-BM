import { EnvironmentView } from '@/components/environment-view'
import { requirePageActor } from '@/lib/server/auth'
import { getEnvironmentWorkspace } from '@/lib/server/environment'
import { requestOrigin } from '@/lib/server/origin'

export default async function EnvironmentPage() {
  const actor = await requirePageActor()
  const [data, origin] = await Promise.all([getEnvironmentWorkspace(actor), requestOrigin()])
  return <EnvironmentView actor={actor} initialData={data} origin={origin} />
}
