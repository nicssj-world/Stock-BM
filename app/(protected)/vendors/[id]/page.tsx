import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { AnnualEvaluationPanel } from '@/components/vendors/annual-evaluation-panel'
import { ReceiptAssessmentCard } from '@/components/vendors/receipt-assessment-card'
import { VendorIssuePanel } from '@/components/vendors/vendor-issue-panel'
import { VendorPerformance, type TrendPoint } from '@/components/vendors/vendor-performance'
import { Button, Card, Notice, PageHeader } from '@/components/ui'
import { formatThaiDateTime } from '@/lib/bm/thai-date'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { listAnnualRevisions } from '@/lib/server/vendor-evaluation'
import { getVendor, getVendorPerformanceSnapshot, listVendorInvoices, listVendorIssues, listVendorReceiptEvents } from '@/lib/server/vendors'
import { isOfficial } from '@/lib/vendors/evaluation'
import { bangkokToday, fiscalYearBE } from '@/lib/vendors/fiscal-year'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `ผลงานผู้ขาย ${(await params).id}` }
}

const UUID = /^[0-9a-f-]{36}$/i

export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fiscalYear?: string }> }) {
  const actor = await requireFullPageActor()
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const query = await searchParams
  const currentFy = fiscalYearBE(bangkokToday())
  const requested = Number.parseInt(query.fiscalYear ?? '', 10)
  const fy = requested >= 2500 && requested <= 3000 ? requested : currentFy
  const trendYears = [fy - 4, fy - 3, fy - 2, fy - 1, fy]
  let data
  try {
    const [vendor, snapshots, issues, events, revisions, invoices] = await Promise.all([
      getVendor(id),
      Promise.all(trendYears.map((year) => getVendorPerformanceSnapshot(id, year, actor))),
      listVendorIssues(id),
      listVendorReceiptEvents(id, 50),
      listAnnualRevisions(id),
      listVendorInvoices(id),
    ])
    data = { vendor, snapshots, issues, events, revisions, invoices }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  const { vendor, snapshots, issues, events, revisions, invoices } = data
  const snapshot = snapshots[snapshots.length - 1]
  const officialFor = (year: number) => revisions.find((r) => r.fiscalYear === year && isOfficial(r))?.frozen ?? null
  const trend: TrendPoint[] = trendYears.map((year, i) => ({ fiscalYear: year, receipts: snapshots[i].activity.receipts, issues: snapshots[i].activity.openIssues + snapshots[i].activity.resolvedIssues, officialScore: officialFor(year)?.score ?? null }))
  const official = officialFor(fy)
  const draftForYear = revisions.find((r) => r.fiscalYear === fy && r.status === 'draft')?.id ?? null
  const isAdmin = actor.role === 'Admin'

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <div><Link href="/admin" className="text-sm font-semibold text-[#0b7f76]">← Admin · Vendors</Link></div>
    <PageHeader eyebrow={`Vendor · ${vendor.code}`} title={vendor.name} description={`${vendor.legalName && vendor.legalName !== vendor.name ? `${vendor.legalName} · ` : ''}${vendor.isActive ? 'ใช้งาน' : 'ปิดการใช้งาน'} · ผลตรวจรับ ปัญหา และรายงานประเมินประจำปี`}
      actions={<a className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854] hover:bg-[#f7fbfb]" href={`/api/vendors/${id}/performance/export?fiscalYear=${fy}`}><Download className="size-4" aria-hidden />ส่งออก CSV</a>} />

    <Card className="p-5"><h2 className="mb-4 font-bold text-[#173d50]">ข้อมูลผู้ขาย</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {([['เลขประจำตัวผู้เสียภาษี', vendor.taxId ? `${vendor.taxId} · ${vendor.taxBranchCode === '00000' ? 'สำนักงานใหญ่ (00000)' : `สาขา ${vendor.taxBranchCode}`}` : null], ['ผู้ติดต่อ', vendor.contactPerson], ['โทรศัพท์', vendor.phone], ['อีเมล', vendor.email], ['ที่อยู่', vendor.address], ['แก้ไขล่าสุด', formatThaiDateTime(vendor.updatedAt)]] as const).map(([term, value]) => <div key={term}><dt className="text-xs text-[#81979c]">{term}</dt><dd className="break-words">{value || <span className="text-[#9aafb4]">ไม่ระบุ</span>}</dd></div>)}
      </dl></Card>

    <form method="get" className="flex flex-wrap items-end gap-3" aria-label="เลือกปีงบประมาณ">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-[#58747d]">ปีงบประมาณ (พ.ศ.)</span>
        <select name="fiscalYear" defaultValue={fy} className="min-h-11 w-40 rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm">{Array.from({ length: 8 }, (_, i) => currentFy + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <Button type="submit" variant="secondary">แสดง</Button></form>

    <section className="space-y-3" aria-labelledby="vendor-performance"><h2 id="vendor-performance" className="text-lg font-bold text-[#173d50]">ผลงานผู้ขาย · ปีงบประมาณ {fy}</h2>
      <VendorPerformance snapshot={snapshot} trend={trend} hrefForYear={(year) => `/vendors/${id}?fiscalYear=${year}`} officialScore={official ? { score: official.score, result: official.result } : null} /></section>

    <Card className="space-y-3 p-5"><h2 className="font-bold text-[#173d50]">รายงานประเมินประจำปี</h2>
      {!isAdmin && <Notice tone="info">การสร้างและสิ้นสุดรายงานทำได้เฉพาะผู้ดูแลระบบ · ผู้ใช้อื่นดูและดาวน์โหลด PDF ของรายงานที่สิ้นสุดแล้วได้</Notice>}
      <AnnualEvaluationPanel revisions={revisions} vendorId={id} fiscalYear={fy} canManage={isAdmin} hasDraftForYear={draftForYear} /></Card>

    <Card className="space-y-4 p-5"><h2 className="font-bold text-[#173d50]">ผลตรวจรับรายครั้ง</h2>
      {events.map((event) => <ReceiptAssessmentCard key={event.receiptId} event={event} canRevise={isAdmin} />)}
      {!events.length && <p className="text-sm text-[#81979c]">ยังไม่มีการรับสินค้าจากผู้ขายนี้</p>}</Card>

    <Card className="space-y-3 p-5"><h2 className="font-bold text-[#173d50]">ปัญหาผู้ขาย</h2>
      <VendorIssuePanel issues={issues} vendorId={id} invoices={invoices} canOpen canAct={isAdmin} emptyText="ยังไม่มีบันทึกปัญหาของผู้ขายนี้" /></Card>
  </main>
}
