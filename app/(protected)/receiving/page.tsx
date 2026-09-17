import { notFound } from 'next/navigation'
import { ReceivingView } from '@/components/receiving-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { assertReceivingEnabled, getReceivingWorkspace } from '@/lib/server/receiving'

export default async function ReceivingPage() {
  const actor = await requireFullPageActor()
  try {
    await assertReceivingEnabled()
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  return <ReceivingView initialData={await getReceivingWorkspace(actor)} />
}
