import { HivLabAlertView } from '@/components/hiv-lab-alert-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getHivLabAlertWorkspace } from '@/lib/server/hiv-lab-alert'

export default async function HivLabAlertPage() {
  const actor = await requireFullPageActor()
  return <HivLabAlertView actor={actor} initialData={await getHivLabAlertWorkspace(actor)} />
}
