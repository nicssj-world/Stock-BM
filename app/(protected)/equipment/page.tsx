import { EquipmentView } from '@/components/equipment-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEquipmentWorkspace } from '@/lib/server/equipment'

export default async function EquipmentPage() {
  const actor = await requireFullPageActor()
  return <EquipmentView actor={actor} initialData={await getEquipmentWorkspace(actor)} />
}
