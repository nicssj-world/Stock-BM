import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { QuickIssue } from '@/components/quick-issue'
import { Notice, PageHeader } from '@/components/ui'
import { requirePageActor } from '@/lib/server/auth'
import { resolveLotForIssue } from '@/lib/server/stock'
import type { LotIssueContext } from '@/lib/bm/types'

// QR sticker target: <app>/issue/<token>. Protected — an unauthenticated scan lands
// on login then returns here. Renders the one-screen quick-issue for the scanned lot.
export default async function IssueTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const actor = await requirePageActor()
  const { token } = await params

  let context: LotIssueContext | null = null
  try {
    context = await resolveLotForIssue(token, actor)
  } catch {
    context = null
  }

  if (!context) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/scan" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ArrowLeft className="size-4" /> สแกนใหม่</Link>
        <PageHeader eyebrow="ตัด stock" title="Quick issue" description="ไม่พบ lot สำหรับ QR นี้" />
        <Notice tone="danger">ไม่พบ lot สำหรับ QR นี้ / Lot not found for this QR</Notice>
      </div>
    )
  }

  return <QuickIssue context={context} />
}
