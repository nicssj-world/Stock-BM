'use client'

import { useMemo, useState } from 'react'
import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'
import type { ReceiptLine, ReceivingWorkspace } from '@/lib/receiving/types'
import { api, StatusBadge } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import { ExpiryException } from '@/components/receiving/expiry-exception'

export function ReceiptLineRow({ line, receivedDate, data, onUpdated }: { line: ReceiptLine; receivedDate: string; data: ReceivingWorkspace; onUpdated?: (data: ReceivingWorkspace) => void }) {
  const item = data.items.find((candidate) => candidate.id === line.stockItemId)
  const location = data.locations.find((candidate) => candidate.id === line.locationId)
  const liveCompliance = useMemo(() => torExpiryCompliance(line.expiryDate, receivedDate), [line.expiryDate, receivedDate])
  const [decision, setDecision] = useState(line.receiptDecision)
  const [reasonCode, setReasonCode] = useState(line.acceptanceReasonCode)
  const [reasonNote, setReasonNote] = useState(line.acceptanceReasonNote)
  const [saving, setSaving] = useState(false)
  const tone = liveCompliance === 'compliant' ? 'accepted' : liveCompliance === 'not_compliant' ? 'warning' : 'neutral'
  const label = liveCompliance === 'compliant' ? '✓ ผ่านเกณฑ์ TOR' : liveCompliance === 'not_compliant' ? '⚠ ไม่ผ่าน TOR' : 'ยังไม่ประเมิน TOR'

  async function persistException(next: { decision?: typeof decision; reasonCode?: typeof reasonCode; reasonNote?: string | null }) {
    const nextDecision = next.decision ?? decision
    const nextReasonCode = next.reasonCode ?? reasonCode
    const nextReasonNote = next.reasonNote ?? reasonNote
    if (liveCompliance !== 'not_compliant' || nextDecision !== 'accepted_with_justification' || !nextReasonCode || (nextReasonCode === 'other' && !nextReasonNote?.trim())) return
    setSaving(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${line.receiptId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          torExpiryCompliance: liveCompliance,
          remainingShelfLifeDays: remainingShelfLife(line.expiryDate, receivedDate),
          receiptDecision: nextDecision,
          acceptanceReasonCode: nextReasonCode,
          acceptanceReasonNote: nextReasonNote,
        }),
      })
      onUpdated?.(result.receiving)
    } finally {
      setSaving(false)
    }
  }

  function changeDecision(nextDecision: typeof decision) {
    setDecision(nextDecision)
    void persistException({ decision: nextDecision })
  }

  function changeReason(nextReasonCode: NonNullable<typeof reasonCode>) {
    setReasonCode(nextReasonCode)
    setDecision('accepted_with_justification')
    void persistException({ decision: 'accepted_with_justification', reasonCode: nextReasonCode })
  }

  function changeReasonNote(nextReasonNote: string) {
    setReasonNote(nextReasonNote)
    void persistException({ decision: 'accepted_with_justification', reasonCode: reasonCode ?? undefined, reasonNote: nextReasonNote })
  }

  return <div className={`rounded-md border p-3 ${liveCompliance === 'not_compliant' ? 'border-[#efc7cc] bg-[#fffafb]' : 'border-[#dce8e9] bg-white'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-[#315763]">{item?.itemCode ?? line.stockItemId} · {item?.name ?? 'ไม่พบ item'}</p><p className="mt-1 text-xs text-[#81979c]">Lot {line.lotNumber ?? '—'} · {line.receivedQty} {item?.unit ?? ''} · {location?.code ?? '—'}</p></div><StatusBadge tone={tone} label={label} /></div>{line.conflicts.length ? <p className="mt-2 text-xs font-semibold text-[#a83541]">ต้องแก้ไขข้อมูลขัดแย้งก่อนยืนยัน</p> : null}{liveCompliance === 'not_compliant' && line.expiryDate ? <ExpiryException lineId={line.id} expiry={line.expiryDate} received={receivedDate} enabled={data.policy.expiryExceptionEnabled} decision={decision} reasonCode={reasonCode} reasonNote={reasonNote} saving={saving} onDecisionChange={changeDecision} onReasonChange={changeReason} onReasonNoteChange={changeReasonNote} /> : null}<AttachmentList module="stock" entityType="stock-receipt-line" entityId={line.id} kind="receipt-line-evidence" label="หลักฐานรายการ / Line evidence" /></div>
}
