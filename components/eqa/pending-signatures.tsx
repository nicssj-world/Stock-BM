'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaWorkspace } from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import type { EqaReadinessTarget } from '@/lib/eqa/rules'
import { Button, Card } from '@/components/ui'
import { ApprovalPanel, type Update } from '@/components/eqa/shared'
import { DOCUMENT_TYPE_LABEL, isSignedBy, signableDocuments } from '@/components/eqa/signable-documents'

/**
 * Step 5's one place to sign: every annual plan, round receipt and annual
 * summary whose data is complete but still lacks a signature, each with its
 * report and signing card. (Each document can still be signed where it lives.)
 */
export function PendingSignatures({ data, actor, onNavigate, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const pending = signableDocuments(data).filter((document) => document.readiness.length === 0 && document.roles.some((role) => !isSignedBy(document, role)))
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-[#173d50]">เอกสารที่รอลงนาม</h2>
          <p className="mt-0.5 text-xs text-[#789097]">เอกสารที่ข้อมูลครบแล้วแต่ยังลงนามไม่ครบทุกบทบาท · ผู้ทำการตรวจวิเคราะห์ลงนามแบบรับตัวอย่างที่การ์ดของรอบ</p>
        </div>
        <span className="rounded-full border border-[#cfe1e0] bg-[#f7fbfa] px-2.5 py-1 text-[11px] font-bold text-[#55727c]">{pending.length} ฉบับ</span>
      </div>
      {pending.length ? (
        <div className="mt-3 divide-y divide-[#e3ebec] overflow-hidden rounded-md border border-[#dfe8e9]">
          {pending.map((document) => {
            const missing = document.roles.filter((role) => !isSignedBy(document, role))
            const open = openKey === document.key
            return (
              <div key={document.key} className="bg-white">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="text-[11px] font-bold text-[#0b7f76]">{DOCUMENT_TYPE_LABEL[document.type]}</p>
                    <p className="font-semibold text-[#315763]">{document.title}</p>
                    <p className="text-xs text-[#a9700f]">รอ {missing.map((role) => EQA_APPROVAL_ROLE_LABELS[role]).join(', ')}</p>
                  </div>
                  <Link href={document.reportHref} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#b8c8cc] px-3 text-xs font-bold text-[#173d50]"><FileText className="size-3.5" aria-hidden="true" />ดูเอกสาร</Link>
                  <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" aria-expanded={open} onClick={() => setOpenKey(open ? null : document.key)}>{open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{open ? 'ซ่อน' : 'ลงนาม'}</Button>
                </div>
                {open ? <div className="border-t border-[#e3ebec] bg-[#f8fbfb] px-4 pb-3">
                  <ApprovalPanel actor={actor} data={data} type={document.type} entityId={document.entityId} state={document.state} approvals={document.approvals} readiness={document.readiness} visibleRoles={document.roles} lockedRoles={document.type === 'round-receipt' ? ['analyst'] : undefined} onNavigate={onNavigate} onOk={onOk} onErr={onErr} />
                </div> : null}
              </div>
            )
          })}
        </div>
      ) : <p className="mt-3 rounded-md border border-dashed border-[#dbe6e7] bg-[#fbfdfd] px-3 py-4 text-center text-sm text-[#789097]">ไม่มีเอกสารที่รอลงนาม</p>}
    </Card>
  )
}
