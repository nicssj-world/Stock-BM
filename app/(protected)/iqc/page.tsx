import { IqcView } from '@/components/iqc-view'
import { requireFullPageActor } from '@/lib/server/auth'
import { getIqcWorkspace } from '@/lib/server/iqc'

type IqcSearchParams = {
  setup?: string | string[]
  instrument?: string | string[]
  lot?: string | string[]
  analyte?: string | string[]
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function IqcPage({ searchParams }: { searchParams: Promise<IqcSearchParams> }) {
  const actor = await requireFullPageActor()
  const params = await searchParams
  const setup = firstQueryValue(params.setup)
  return (
    <IqcView
      actor={actor}
      initialData={await getIqcWorkspace(actor)}
      initialTab={actor.role !== 'Assistant' && setup !== null ? 'manage' : 'enter'}
      initialSetup={setup}
      initialInstrumentId={firstQueryValue(params.instrument)}
      initialLotId={firstQueryValue(params.lot)}
      initialAnalyteId={firstQueryValue(params.analyte)}
    />
  )
}
