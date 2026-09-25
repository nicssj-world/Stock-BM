import type { Metadata } from 'next'
import Link from 'next/link'
import { SignatureSettings } from '@/components/vendors/signature-settings'
import { Card, PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { getMySigner } from '@/lib/server/vendor-evaluation'

export const metadata: Metadata = { title: 'ตำแหน่งและลายเซ็นของฉัน' }

export default async function MySignaturePage() {
  const actor = await requireFullPageActor()
  const signer = await getMySigner(actor)
  return <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
    <div><Link href="/vendors" className="text-sm font-semibold text-[#0b7f76]">← ผู้ขายทั้งหมด</Link></div>
    <PageHeader eyebrow={actor.displayName} title="ตำแหน่งและลายเซ็นของฉัน" description="ใช้เมื่อคุณเป็นผู้ประเมิน ผู้ทบทวน หรือผู้อนุมัติของรายงานประเมินผู้ขาย" />
    <Card className="p-5"><SignatureSettings position={signer.position} signature={signer.signature} /></Card>
  </main>
}
