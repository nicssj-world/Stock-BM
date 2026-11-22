import { InstrumentComparisonView } from '@/components/instrument-comparison-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getInstCompWorkspace } from '@/lib/server/instcomp'

export default async function InstrumentComparisonPage() {
  const actor = await requireFullPageActor()
  return <InstrumentComparisonView actor={actor} initialData={await getInstCompWorkspace(actor)} />
}
