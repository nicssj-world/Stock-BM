import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { VendorEvaluationView } from '@/components/vendors/vendor-evaluation'
import { requireFullPageActor } from '@/lib/server/auth'
import { getVendorEvaluationWorkspace } from '@/lib/server/vendor-evaluation'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Annual Vendor Evaluation ${(await params).id}` }
}

export default async function VendorEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFullPageActor()
  try {
    return <VendorEvaluationView initialEvaluation={await getVendorEvaluationWorkspace((await params).id)} />
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) notFound()
    throw error
  }
}
