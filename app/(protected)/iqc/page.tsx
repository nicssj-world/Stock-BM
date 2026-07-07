import { IqcView } from '@/components/iqc-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getIqcWorkspace } from '@/lib/server/iqc'

export default async function IqcPage() {
  const actor = await requireFullPageActor()
  return <IqcView actor={actor} initialData={await getIqcWorkspace(actor)} />
}
