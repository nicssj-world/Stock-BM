import { LocationQrSheet, type LocationQrItem } from '@/components/location-qr-sheet'
import { requireAdminPageActor } from '@/lib/server/auth'
import { requestOrigin } from '@/lib/server/origin'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function InventoryLocationQrPage() {
  const actor = await requireAdminPageActor()
  const [data, origin] = await Promise.all([getStockWorkspace(actor), requestOrigin()])
  const locations: LocationQrItem[] = data.locations
    .filter((location) => location.isActive)
    .map((location) => ({ id: location.id, code: location.code, name: location.name, storageCondition: location.storageCondition }))

  return <LocationQrSheet locations={locations} origin={origin} />
}
