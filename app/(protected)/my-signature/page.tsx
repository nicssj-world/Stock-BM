import type { Metadata } from 'next'
import { SignatureSettings } from '@/components/vendors/signature-settings'
import { Card, PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { getMySigner } from '@/lib/server/vendor-evaluation'

export const metadata: Metadata = { title: 'ลายเซ็นของฉัน' }

export default async function MySignaturePage() {
  const actor = await requireFullPageActor()
  const signer = await getMySigner(actor)
  return <main className="mx-auto max-w-2xl space-y-6">
    <PageHeader eyebrow={actor.displayName} title="ลายเซ็นและตำแหน่งของฉัน" description="บันทึกลายเซ็นไว้ครั้งเดียว แล้วกดลงนามได้เลยใน EQA, บันทึกงานเครื่องมือ และรายงานประเมินผู้ขาย โดยไม่ต้องวาดใหม่" />
    <Card className="p-5"><SignatureSettings position={signer.position} signature={signer.signature} /></Card>
  </main>
}
