import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EnvQuickLog } from '@/components/env-quick-log'
import { Card, Notice, PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { resolveEnvToken } from '@/lib/server/environment'
import type { EnvUnit } from '@/lib/env/types'

// QR sticker target: <app>/environment/u/<token>. Protected, so an unauthenticated
// scan lands on login then returns here. Renders a fast single-unit entry form.
export default async function EnvUnitTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const actor = await requireFullPageActor()
  const { token } = await params

  let unit: EnvUnit | null = null
  try {
    unit = await resolveEnvToken(token)
  } catch {
    unit = null
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href="/environment" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ArrowLeft className="size-4" /> ทั้งหมด / All units</Link>
      <PageHeader eyebrow="บันทึกอุณหภูมิ" title="Temperature log" description="สแกน QR ที่ตู้แล้วบันทึกค่าได้ทันที" />
      {unit ? (
        <Card className="p-4">
          <EnvQuickLog unit={unit} autoFocus allowBackdate={actor.role === 'Admin'} />
        </Card>
      ) : (
        <Notice tone="danger">ไม่พบตู้สำหรับ QR นี้ หรือตู้ถูกปิดใช้งาน / Unit not found or inactive</Notice>
      )}
    </div>
  )
}
