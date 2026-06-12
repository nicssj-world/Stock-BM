import { AdminView } from '@/components/admin-view'
import { requireAdminPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

export default async function AdminPage() {
  const actor = await requireAdminPageActor()
  return <AdminView actor={actor} initialData={await getStockWorkspace(actor)} />
}

