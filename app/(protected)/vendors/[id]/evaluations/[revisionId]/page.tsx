import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AnnualEvaluationEditor } from '@/components/vendors/annual-evaluation-editor'
import { PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { getAnnualRevision, listSigners } from '@/lib/server/vendor-evaluation'

export const metadata: Metadata = { title: 'รายงานประเมินผู้ขายประจำปี' }

const UUID = /^[0-9a-f-]{36}$/i

export default async function AnnualEvaluationPage({ params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const actor = await requireFullPageActor()
  const { id, revisionId } = await params
  if (!UUID.test(id) || !UUID.test(revisionId)) notFound()
  let revision
  try { revision = await getAnnualRevision(revisionId) } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  if (revision.vendorId !== id) notFound()
  const canManage = actor.role === 'Admin'
  const signers = canManage && revision.status === 'draft' ? await listSigners(actor) : []
  const vendor = revision.evidence.vendor
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
    <div><Link href={`/vendors/${id}`} className="text-sm font-semibold text-[#0b7f76]">← {vendor.name}</Link></div>
    <PageHeader eyebrow="Vendor annual evaluation" title={`รายงานประเมินผู้ขายประจำปี ${revision.fiscalYear}`} description={`${vendor.vendorCode} · ${vendor.name}`} />
    <AnnualEvaluationEditor revision={revision} signers={signers} canManage={canManage} />
  </main>
}
