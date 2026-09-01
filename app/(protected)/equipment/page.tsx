import { EquipmentView } from '@/components/equipment-view'
import { formatDateTime } from '@/lib/bm/rules'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEquipmentWorkspace } from '@/lib/server/equipment'

export default async function EquipmentPage() {
  const actor = await requireFullPageActor()
  return <EquipmentView actor={actor} historyPrintedAt={formatDateTime(new Date().toISOString())} initialData={await getEquipmentWorkspace(actor)} />
}
