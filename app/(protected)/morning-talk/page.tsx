import { MorningTalkView } from '@/components/morning-talk-view'
import { requirePageActor } from '@/lib/server/auth'
import { getMorningTalkWorkspace } from '@/lib/server/morning-talk'

export default async function MorningTalkPage() {
  const actor = await requirePageActor()
  return <MorningTalkView actor={actor} initialData={await getMorningTalkWorkspace(actor)} />
}
