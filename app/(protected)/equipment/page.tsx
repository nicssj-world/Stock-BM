import { EquipmentView } from '@/components/equipment-view'
import { EquipmentArchiveView } from '@/components/equipment-archive-view'
import { formatDateTime } from '@/lib/bm/rules'
import { equipmentArchiveModeEnabled } from '@/lib/server/equipment-archive'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEquipmentWorkspace } from '@/lib/server/equipment'

export default async function EquipmentPage() {
  const actor = await requireFullPageActor()
  const workspace = await getEquipmentWorkspace(actor)
  if (equipmentArchiveModeEnabled()) return <EquipmentArchiveView workspace={workspace} />
  return <EquipmentView actor={actor} historyPrintedAt={formatDateTime(new Date().toISOString())} initialData={workspace} />
}
