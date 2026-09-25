'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { api, Button, Notice } from '@/components/ui'
import { RESULT_LABELS, isOfficial, type AnnualRevision } from '@/lib/vendors/evaluation'

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })

/** Annual reports for one vendor (LABCBH-Stock VendorAnnualEvaluationPanel): score and PDF appear only for official (final, approved-policy) reports. */
export function AnnualEvaluationPanel({ revisions, vendorId, fiscalYear, canManage, hasDraftForYear }: { revisions: AnnualRevision[]; vendorId: string; fiscalYear: number; canManage: boolean; hasDraftForYear: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function open() {
    if (hasDraftForYear) { router.push(`/vendors/${vendorId}/evaluations/${hasDraftForYear}`); return }
    setError(null)
    startTransition(async () => {
      try {
        const { revisionId } = await api<{ revisionId: string }>(`/api/vendors/${vendorId}/evaluations`, { method: 'POST', body: JSON.stringify({ fiscalYear }) })
        router.push(`/vendors/${vendorId}/evaluations/${revisionId}`)
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'สร้างฉบับร่างไม่สำเร็จ') }
    })
  }
  return <div className="space-y-4">
    {canManage && <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={pending} onClick={open}>{hasDraftForYear ? `ดำเนินการฉบับร่างปี ${fiscalYear}` : `สร้างฉบับร่างปี ${fiscalYear}`}</Button><Link href="/vendors/evaluation-policy" className="text-sm font-semibold text-[#0b7f76] underline">นโยบายและเกณฑ์</Link></div>}
    {error && <Notice tone="danger">{error}</Notice>}
    {revisions.length === 0 ? <p className="text-sm text-[#81979c]">ยังไม่มีรายงานประเมินของผู้ขายนี้</p> : <div className="relative overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2">ปีงบประมาณ</th><th className="p-2">ฉบับ</th><th className="p-2">นโยบาย</th><th className="p-2">สถานะ</th><th className="p-2">คะแนน</th><th className="p-2">ผล</th><th className="p-2"><span className="sr-only">ลิงก์</span></th></tr></thead>
      <tbody>{revisions.map((r) => { const official = isOfficial(r); return <tr key={r.id} className="border-t border-[#e5eeee]">
        <td className="p-2">{r.fiscalYear}</td><td className="p-2">{r.revisionNumber}</td>
        <td className="p-2"><span className="mono">{r.policyVersion}</span>{r.policyStatus !== 'approved' && <small className="block text-[#81979c]">ข้อเสนอ ยังไม่อนุมัติ</small>}</td>
        <td className="p-2">{r.status === 'final' ? 'สิ้นสุดแล้ว' : 'ฉบับร่าง'}{r.reportNumber && <small className="mono block text-[#81979c]">{r.reportNumber}</small>}</td>
        <td className="p-2 tabular-nums">{official && r.frozen ? number.format(r.frozen.score) : '—'}</td><td className="p-2">{official && r.frozen ? RESULT_LABELS[r.frozen.result] : '—'}</td>
        <td className="whitespace-nowrap p-2"><Link href={`/vendors/${vendorId}/evaluations/${r.id}`} className="font-semibold text-[#0b7f76] underline">รายละเอียด</Link>{official && <> · <a href={`/api/vendors/${vendorId}/evaluations/${r.id}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#0b7f76] underline"><Download className="size-3.5" aria-hidden />PDF</a></>}</td></tr> })}</tbody></table></div>}
  </div>
}
