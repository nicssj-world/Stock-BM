import { EnvQrSheet } from '@/components/env-qr-sheet'
import { requireAdminPageActor } from '@/lib/server/auth'
import { getEnvironmentWorkspace } from '@/lib/server/environment'
import { requestOrigin } from '@/lib/server/origin'

export default async function EnvQrPage() {
  const actor = await requireAdminPageActor()
  const [data, origin] = await Promise.all([getEnvironmentWorkspace(actor), requestOrigin()])
  return <EnvQrSheet units={data.units.filter((unit) => unit.isActive)} origin={origin} />
}
