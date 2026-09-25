import type { Metadata } from 'next'
import Link from 'next/link'
import { VendorPolicyPanel } from '@/components/vendors/vendor-policy-panel'
import { Notice, PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { listEvaluationPolicies } from '@/lib/server/vendor-evaluation'

export const metadata: Metadata = { title: 'นโยบายประเมินผู้ขาย' }

// One QP for the whole work group: every signed-in user can read the policy, only an Admin can change it.
export default async function EvaluationPolicyPage() {
  const actor = await requireFullPageActor()
  const policies = await listEvaluationPolicies().catch(() => null)
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
    <div><Link href="/vendors" className="text-sm font-semibold text-[#0b7f76]">← ผู้ขายทั้งหมด</Link></div>
    <PageHeader eyebrow="Vendor evaluation" title="นโยบายประเมินผู้ขาย" description="เวอร์ชัน น้ำหนักเกณฑ์ เกณฑ์ผ่าน และความครอบคลุมที่ใช้คำนวณรายงานประจำปี · ตามระบบประเมินผู้ขายของ LABCBH-Stock" />
    {policies ? <VendorPolicyPanel policies={policies} canManage={actor.role === 'Admin'} /> : <Notice tone="danger">อ่านนโยบายไม่สำเร็จ</Notice>}
  </main>
}
