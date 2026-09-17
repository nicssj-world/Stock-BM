import { AdminView } from '@/components/admin-view'
import { requireAdminPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'
import { listSupplierCandidates, listVendors } from '@/lib/server/vendors'

export default async function AdminPage() {
  const actor = await requireAdminPageActor()
  const [initialData, initialVendors, initialSupplierCandidates] = await Promise.all([
    getStockWorkspace(actor),
    listVendors(),
    listSupplierCandidates(),
  ])
  return <AdminView actor={actor} initialData={initialData} initialVendors={initialVendors} initialSupplierCandidates={initialSupplierCandidates} />
}

