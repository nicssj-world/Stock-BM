import { MethodVerificationView } from '@/components/method-verification-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getMethodVerifWorkspace } from '@/lib/server/methodverif'

export default async function MethodVerificationPage() {
  const actor = await requireFullPageActor()
  return <MethodVerificationView actor={actor} initialData={await getMethodVerifWorkspace(actor)} />
}
