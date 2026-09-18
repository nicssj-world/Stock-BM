'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { VendorIssue, VendorIssueType } from '@/lib/receiving/types'
import type { VendorPerformance } from '@/lib/vendors/types'
import { ASSESSMENT_LABELS, hasAbnormalAnswer } from '@/lib/receiving/assessment'
import { api, Button, Card, Field, Input, Notice, Select, StatCard, Textarea } from '@/components/ui'
import { VendorMetricsPanel } from '@/components/vendors/vendor-metrics-panel'

const issueLabels: Record<VendorIssueType, string> = {
  complaint: 'Complaint / ข้อร้องเรียน',
  documentation_discrepancy: 'Documentation discrepancy',
  packaging_damage: 'Packaging damage',
  temperature_out_of_range: 'Temperature out of range',
  quantity_discrepancy: 'Quantity discrepancy',
  expiry_non_compliant: 'Expiry non-compliant',
  other: 'อื่น ๆ',
}

const issueTypes = Object.keys(issueLabels) as VendorIssueType[]

function issueStatusLabel(issue: VendorIssue) {
  if (issue.resolutionStatus === 'resolved') return 'แก้ไขแล้ว'
  if (issue.resolutionStatus === 'cancelled') return 'ยกเลิก'
  return 'เปิดอยู่'
}

export function VendorPerformanceView({ initialPerformance }: { initialPerformance: VendorPerformance }) {
  const router = useRouter()
  const [performance, setPerformance] = useState(initialPerformance)
  const [fiscalYear, setFiscalYear] = useState(initialPerformance.fiscalYear)
  const [issueType, setIssueType] = useState<VendorIssueType>('complaint')
  const [description, setDescription] = useState('')
  const [receiptId, setReceiptId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  function changeFiscalYear(event: FormEvent) {
    event.preventDefault()
    if (/^\d{4}$/.test(fiscalYear)) router.push(`/vendors/${performance.vendor.id}?fiscalYear=${fiscalYear}`)
  }

  async function addIssue(event: FormEvent) {
    event.preventDefault()
    if (!description.trim()) return
    setBusy(true)
    try {
      const result = await api<{ issues: VendorIssue[] }>(`/api/vendors/${performance.vendor.id}/issues`, {
        method: 'POST',
        body: JSON.stringify({ issueType, description, receiptId: receiptId || null }),
      })
      setPerformance({ ...performance, issues: result.issues })
      setDescription('')
      setReceiptId('')
      setNotice({ tone: 'success', text: 'บันทึก issue แล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึก issue ไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  async function updateIssue(issue: VendorIssue, status: 'open' | 'resolved' | 'cancelled') {
    setBusy(true)
    try {
      const result = await api<{ issues: VendorIssue[] }>(`/api/vendors/${performance.vendor.id}/issues/${issue.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolutionStatus: status, resolutionNote: issue.resolutionNote }),
      })
      setPerformance({ ...performance, issues: result.issues })
      setNotice({ tone: 'success', text: status === 'resolved' ? 'ปิด issue แล้ว' : 'อัปเดต issue แล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดต issue ไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  async function openEvaluation() {
    setBusy(true)
    try {
      const result = await api<{ evaluation: { evaluation: { id: string } } }>('/api/vendor-evaluations', {
        method: 'POST',
        body: JSON.stringify({ vendorId: performance.vendor.id, fiscalYear: performance.fiscalYear, judgment: { summary: '', strengths: '', risks: '', actions: '' } }),
      })
      router.push(`/vendors/evaluations/${result.evaluation.evaluation.id}`)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เปิด annual evaluation ไม่สำเร็จ' })
    } finally { setBusy(false) }
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-[#0b7f76] uppercase">Vendor Performance · Stock1</p>
          <h1 className="mt-1 text-2xl font-bold text-[#173d50] sm:text-3xl">{performance.vendor.code} · {performance.vendor.name}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6a838c]">หลักฐานจากใบรับเข้า การประเมินการรับสินค้า (Receipt Assessment) และ issue · ไม่มีคะแนน น้ำหนัก หรือการจัดอันดับ (P-13/P-14 ยังไม่อนุมัติ)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/vendors/${performance.vendor.id}/report?fiscalYear=${performance.fiscalYear}`} className="inline-flex min-h-11 items-center rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854]">พิมพ์รายงาน</Link>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void openEvaluation()}>Annual evaluation</Button>
          <a href={`/api/vendors/${performance.vendor.id}/performance/export?fiscalYear=${performance.fiscalYear}`} className="inline-flex min-h-11 items-center rounded-md bg-[#0b7f76] px-3.5 py-2 text-sm font-semibold text-white">ส่งออก CSV</a>
        </div>
      </div>

      {notice ? <Notice tone={notice.tone === 'success' ? 'success' : 'danger'}>{notice.text}</Notice> : null}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold text-[#315763]">รอบปีงบประมาณ</p><p className="mt-1 text-xs text-[#81979c]">{performance.from} ถึง {performance.to} · แสดงปีไทย {Number(performance.fiscalYear) + 543}</p></div>
        <form onSubmit={changeFiscalYear} className="flex gap-2"><Field label="Fiscal year"><Input className="w-32" inputMode="numeric" pattern="\d{4}" value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)} /></Field><Button type="submit" className="mt-5">ดูปีนี้</Button></form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Confirmed receipts" value={performance.receiptSources.filter((receipt) => receipt.status === 'confirmed').length} hint="แหล่งข้อมูลในรอบปี" />
        <StatCard label="ประเมินแล้ว" value={performance.metrics.source.assessmentsCompleted} tone="accepted" hint="Receipt Assessment completed" />
        <StatCard label="รอประเมิน" value={performance.metrics.source.assessmentsPending} tone="warning" hint="ไม่นับใน denominator" />
        <StatCard label="Open issues" value={performance.issues.filter((issue) => issue.resolutionStatus === 'open').length} tone="investigate" hint="แยกจาก complaint resolution" />
      </div>

      <section>
        <div className="mb-3"><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Traceable metrics</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">ตัวชี้วัดตามหลักฐาน</h2></div>
        <VendorMetricsPanel metrics={performance.metrics} receiptLabel={(id) => performance.receiptSources.find((receipt) => receipt.id === id)?.receiptNo ?? `receipt ${id.slice(0, 8)}`} />
      </section>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Receipt Assessment</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">ผลการประเมินการรับสินค้า</h2><p className="mt-1 text-xs text-[#81979c]">หลักฐานต้นทางของตัวชี้วัดสภาพสินค้า เอกสาร ความถูกต้อง cold chain และข้อร้องเรียน</p></div><span className="text-xs font-semibold text-[#81979c]">{performance.assessmentSources.length} รายการ</span></div>
        <div className="mt-3 space-y-2">{performance.assessmentSources.map((assessment) => { const receipt = performance.receiptSources.find((item) => item.id === assessment.receiptId); const abnormal = assessment.status === 'completed' && hasAbnormalAnswer(assessment); return <div key={assessment.id} className={`rounded-md border px-3 py-2 text-xs ${abnormal ? 'border-[#efc7cc] bg-[#fffafb]' : 'border-[#e1eaeb]'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-[#315763]">{receipt?.receiptNo ?? assessment.receiptId.slice(0, 8)} · {receipt?.receivedDate ?? ''} · {assessment.status === 'completed' ? (abnormal ? 'มีรายการผิดปกติ' : 'ปกติทุกข้อ') : 'รอประเมิน'}</p><Link href={`/receiving/receipts/${assessment.receiptId}/report`} className="font-semibold text-[#0b7f76] underline">เปิดใบรับเข้า</Link></div>{assessment.status === 'completed' ? <p className="mt-1 text-[#58747d]">{ASSESSMENT_LABELS.productCondition.title}: {assessment.productCondition === 'abnormal' ? ASSESSMENT_LABELS.productCondition.options.abnormal : ASSESSMENT_LABELS.productCondition.options.normal} · {ASSESSMENT_LABELS.documentation.title}: {assessment.documentation === 'incomplete' ? ASSESSMENT_LABELS.documentation.options.incomplete : ASSESSMENT_LABELS.documentation.options.complete} · {ASSESSMENT_LABELS.itemCorrectness.title}: {assessment.itemCorrectness === 'problem' ? ASSESSMENT_LABELS.itemCorrectness.options.problem : ASSESSMENT_LABELS.itemCorrectness.options.correct} · Cold chain: {assessment.coldChainApplicable ? (assessment.coldChainCondition === 'inappropriate' ? ASSESSMENT_LABELS.coldChainCondition.options.inappropriate : ASSESSMENT_LABELS.coldChainCondition.options.appropriate) : ASSESSMENT_LABELS.coldChainApplicable.options.false} · ข้อร้องเรียน: {assessment.hasComplaint ? 'มี' : 'ไม่มี'}{assessment.note ? ` · หมายเหตุ: ${assessment.note}` : ''}</p> : null}</div> })}{!performance.assessmentSources.length ? <p className="py-6 text-center text-sm text-[#81979c]">ยังไม่มีการประเมินในรอบปีนี้</p> : null}</div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Evidence capture</p><h2 className="mt-1 text-xl font-bold text-[#173d50]">Complaint และ issue resolution</h2><p className="mt-1 text-xs text-[#81979c]">บันทึก discrepancy / complaint เพื่อให้ตัวเลขตามรอยกลับไปยังหลักฐานได้</p></div><span className="text-xs font-semibold text-[#81979c]">{performance.issues.length} รายการ</span></div>
        <form onSubmit={addIssue} className="mt-4 grid gap-3 rounded-lg border border-[#e1eaeb] bg-[#fbfdfd] p-3 md:grid-cols-[180px_1fr_220px_auto] md:items-end">
          <Field label="ประเภท"><Select value={issueType} onChange={(event) => setIssueType(event.target.value as VendorIssueType)}>{issueTypes.map((type) => <option key={type} value={type}>{issueLabels[type]}</option>)}</Select></Field>
          <Field label="รายละเอียด"><Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="ระบุข้อเท็จจริงและหลักฐานที่เกี่ยวข้อง" /></Field>
          <Field label="ผูกกับ receipt (ถ้ามี)"><Select value={receiptId} onChange={(event) => setReceiptId(event.target.value)}><option value="">ไม่ผูก receipt</option>{performance.receiptSources.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.receiptNo ?? receipt.id.slice(0, 8)} · {receipt.receivedDate}</option>)}</Select></Field>
          <Button type="submit" disabled={busy || !description.trim()}>บันทึก issue</Button>
        </form>
        <div className="mt-4 space-y-2">{performance.issues.map((issue) => <div key={issue.id} className="rounded-lg border border-[#e1eaeb] bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-[#315763]">{issueLabels[issue.issueType]}</p><p className="mt-1 text-xs leading-5 text-[#58747d]">{issue.description}</p><p className="mt-1 text-[11px] text-[#9aafb4]">เปิดเมื่อ {new Date(issue.openedAt).toLocaleString('th-TH')} · {issue.receiptId ? `receipt ${issue.receiptId.slice(0, 8)}` : 'ไม่ผูก receipt'}</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${issue.resolutionStatus === 'resolved' ? 'border-[#c6e2ca] bg-[#f1faf3] text-[#2f7d44]' : issue.resolutionStatus === 'cancelled' ? 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]'}`}>{issueStatusLabel(issue)}</span>{issue.receiptId ? <Link href={`/receiving/receipts/${issue.receiptId}/report`} className="text-xs font-semibold text-[#0b7f76] underline">ดู receipt</Link> : null}</div></div>{issue.resolutionNote ? <p className="mt-2 rounded-md bg-[#f7fbfa] px-2 py-1.5 text-xs text-[#58747d]">ผลการแก้ไข: {issue.resolutionNote}</p> : null}{issue.resolutionStatus === 'open' ? <div className="mt-2 flex gap-2"><Button type="button" className="min-h-9 px-2.5 py-1 text-xs" disabled={busy} onClick={() => void updateIssue(issue, 'resolved')}>ปิด issue</Button><Button type="button" variant="ghost" className="min-h-9 px-2.5 py-1 text-xs" disabled={busy} onClick={() => void updateIssue(issue, 'cancelled')}>ยกเลิก</Button></div> : <Button type="button" variant="ghost" className="mt-2 min-h-9 px-2.5 py-1 text-xs" disabled={busy} onClick={() => void updateIssue(issue, 'open')}>เปิดกลับเพื่อทบทวน</Button>}</div>)}{!performance.issues.length ? <p className="py-7 text-center text-sm text-[#81979c]">ยังไม่มี issue ในรอบปีนี้</p> : null}</div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Receipt drill-down</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">แหล่งข้อมูลใบรับเข้า</h2></div><span className="text-xs text-[#81979c]">{performance.receiptSources.length} receipts</span></div><div className="mt-3 space-y-2">{performance.receiptSources.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#e1eaeb] px-3 py-2 text-xs"><div><p className="font-semibold text-[#315763]">{receipt.receiptNo ?? receipt.id.slice(0, 8)} · {receipt.receivedDate}</p><p className="mt-0.5 text-[#81979c]">{receipt.status} · {receipt.assessmentStatus === 'completed' ? 'ประเมินแล้ว' : receipt.assessmentStatus === 'pending' ? 'รอประเมิน' : 'ไม่มีการประเมิน'}</p></div><Link href={`/receiving/receipts/${receipt.id}/report`} className="font-semibold text-[#0b7f76] underline">เปิดรายงาน</Link></div>)}{!performance.receiptSources.length ? <p className="py-6 text-center text-sm text-[#81979c]">ไม่มี receipt ในรอบปีนี้</p> : null}</div></Card>
        <Card className="p-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Significant events</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">เหตุการณ์สำคัญ</h2></div><span className="text-xs text-[#81979c]">ไม่ถูกหัก/บวกอัตโนมัติ</span></div><div className="mt-3 space-y-2">{performance.significantEvents.map((event) => <div key={event.id} className="rounded-md border border-[#e1eaeb] px-3 py-2 text-xs"><div className="flex justify-between gap-2"><p className="font-semibold text-[#315763]">{event.eventType}</p><span className="text-[#a9700f]">{event.severity}</span></div><p className="mt-1 text-[#58747d]">{event.description}</p><p className="mt-1 text-[#81979c]">{event.eventDate}</p></div>)}{!performance.significantEvents.length ? <p className="py-6 text-center text-sm text-[#81979c]">ยังไม่มี significant event ในรอบปีนี้</p> : null}</div></Card>
      </div>
    </main>
  )
}
