import { AppShell } from '@/components/app-shell'
import { requireLayoutActor } from '@/lib/server/auth'
import { getReceivingNavEnabled } from '@/lib/server/receiving'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireLayoutActor()
  const receivingEnabled = await getReceivingNavEnabled()
  return <AppShell actor={actor} receivingEnabled={receivingEnabled}>{children}</AppShell>
}

