import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, PageHeader } from '@/components/ui'
import { requireFullPageActor } from '@/lib/server/auth'
import { listAnnualRevisions } from '@/lib/server/vendor-evaluation'
import { getVendorPerformanceSnapshot, listVendors } from '@/lib/server/vendors'
import { RESULT_LABELS, isOfficial } from '@/lib/vendors/evaluation'
import { bangkokToday, fiscalYearBE } from '@/lib/vendors/fiscal-year'

export const metadata: Metadata = { title: 'ผู้ขาย / ประเมินผู้ขาย' }

export default async function VendorsPage() {
  const actor = await requireFullPageActor()
  const fy = fiscalYearBE(bangkokToday())
  const vendors = await listVendors()
  const rows = await Promise.all(vendors.map(async (vendor) => {
    const [snapshot, revisions] = await Promise.all([getVendorPerformanceSnapshot(vendor.id, fy, actor), listAnnualRevisions(vendor.id)])
    const official = revisions.find((r) => r.fiscalYear === fy && isOfficial(r))?.frozen ?? null
    const hasDraft = revisions.some((r) => r.fiscalYear === fy && r.status === 'draft')
    return { vendor, activity: snapshot.activity, official, hasDraft }
  }))

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <PageHeader eyebrow="Vendors" title="ผู้ขาย / ประเมินผู้ขาย" description={`ผลตรวจรับ ปัญหา และรายงานประเมินประจำปีงบประมาณ ${fy} (1 ต.ค. – 30 ก.ย.) เลือกผู้ขายเพื่อดูรายละเอียด`}
      actions={<div className="flex flex-wrap gap-2 text-sm font-semibold text-[#0b7f76]">
        <Link href="/vendors/evaluation-policy" className="underline">นโยบายประเมินผู้ขาย</Link>
        <Link href="/vendors/my-signature" className="underline">ตำแหน่งและลายเซ็นของฉัน</Link>
        {actor.role === 'Admin' ? <Link href="/admin" className="underline">จัดการข้อมูลผู้ขาย</Link> : null}
      </div>} />
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-[#e5eeee] text-xs text-[#6a838c]">
          <tr>
            <th className="px-4 py-3 font-semibold">ผู้ขาย</th>
            <th className="px-4 py-3 text-right font-semibold">ใบรับ</th>
            <th className="px-4 py-3 text-right font-semibold">รอประเมิน</th>
            <th className="px-4 py-3 text-right font-semibold">ปัญหาเปิดอยู่</th>
            <th className="px-4 py-3 font-semibold">รายงานปี {fy}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ vendor, activity, official, hasDraft }) => <tr key={vendor.id} className="border-b border-[#eef4f4] last:border-0">
            <td className="px-4 py-3">
              <Link href={`/vendors/${vendor.id}`} className="font-semibold text-[#0b7f76] hover:underline">{vendor.name}</Link>
              <p className="text-xs text-[#81979c]">{vendor.code}{vendor.isActive ? '' : ' · ปิดการใช้งาน'}</p>
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{activity.receipts}</td>
            <td className="px-4 py-3 text-right tabular-nums">{activity.pendingAssessments}</td>
            <td className="px-4 py-3 text-right tabular-nums">{activity.openIssues}</td>
            <td className="px-4 py-3">{official ? `${official.score.toFixed(2)}% · ${RESULT_LABELS[official.result]}` : hasDraft ? 'มีฉบับร่าง' : <span className="text-[#81979c]">ยังไม่มี</span>}</td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length ? <p className="py-8 text-center text-sm text-[#81979c]">ยังไม่มีผู้ขาย{actor.role === 'Admin' ? ' เพิ่มได้ที่ Admin → ผู้ขาย' : ''}</p> : null}
    </Card>
  </main>
}
