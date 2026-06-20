import { LotQrSheet, type LotQrItem } from '@/components/lot-qr-sheet'
import { requireAdminPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'
import { requestOrigin } from '@/lib/server/origin'

export default async function InventoryQrPage() {
  const actor = await requireAdminPageActor()
  const [data, origin] = await Promise.all([getStockWorkspace(actor), requestOrigin()])

  const lots: LotQrItem[] = data.items
    .filter((item) => item.isActive)
    .flatMap((item) =>
      item.lots
        .filter((lot) => lot.totalOnHand > 0)
        .map((lot) => ({ token: lot.internalQrToken, itemCode: item.itemCode, itemName: item.name, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate })),
    )

  return <LotQrSheet lots={lots} origin={origin} />
}
