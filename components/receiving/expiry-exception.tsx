'use client'

import { formatThaiDate } from '@/lib/bm/thai-date'
import { addCalendarMonths, remainingShelfLife } from '@/lib/bm/shelf-life'
import type { AcceptanceReasonCode, ReceiptDecision } from '@/lib/receiving/types'
import { Notice } from '@/components/ui'

const reasons: Array<{ value: AcceptanceReasonCode; label: string }> = [
  { value: 'urgent_need', label: 'มีความจำเป็นเร่งด่วนในการใช้งาน → urgent_need' },
  { value: 'consume_before_expiry', label: 'คาดว่าสามารถใช้หมดก่อนวันหมดอายุ → consume_before_expiry' },
  { value: 'no_alternative', label: 'ไม่มีสินค้าทดแทน / ผู้ขายไม่มี Lot ที่อายุยาวกว่า → no_alternative' },
  { value: 'approved_by_authority', label: 'ได้รับการยืนยัน/อนุมัติให้รับสินค้า → approved_by_authority' },
  { value: 'other', label: 'อื่น ๆ __________________ → other (note required)' },
]

function monthDayBreakdown(expiry: string, received: string) {
  let months = 0
  while (addCalendarMonths(received, months + 1) <= expiry) months += 1
  const anchor = addCalendarMonths(received, months)
  return { months, days: remainingShelfLife(expiry, anchor) ?? 0 }
}

export function ExpiryException({
  lineId,
  expiry,
  received,
  enabled,
  decision,
  reasonCode,
  reasonNote,
  saving = false,
  onDecisionChange,
  onReasonChange,
  onReasonNoteChange,
}: {
  lineId: string
  expiry: string
  received: string
  enabled: boolean
  decision: ReceiptDecision
  reasonCode: AcceptanceReasonCode | null
  reasonNote: string | null
  saving?: boolean
  onDecisionChange: (value: ReceiptDecision) => void
  onReasonChange: (value: AcceptanceReasonCode) => void
  onReasonNoteChange: (value: string) => void
}) {
  const { months, days } = monthDayBreakdown(expiry, received)
  return (
    <div className="mt-3 space-y-3 rounded-md border border-[#efc7cc] bg-[#fff5f6] p-3 text-sm text-[#7f2935]">
      <p className="font-bold">⚠ Expiry ไม่เป็นไปตามเงื่อนไข TOR</p>
      <p>Expiry: {formatThaiDate(expiry)}</p>
      <p>อายุคงเหลือ ณ วันรับ: {months} เดือน {days} วัน</p>
      <p>เกณฑ์ TOR: &gt; 6 เดือน</p>
      <fieldset disabled={saving} className="space-y-2">
        <legend className="font-semibold">เหตุผลที่ยอมรับสินค้า *</legend>
        {reasons.map((reason) => (
          <label key={reason.value} className="flex items-start gap-2 text-xs leading-5">
            <input
              type="radio"
              name={`expiry-reason-${lineId}`}
              value={reason.value}
              checked={reasonCode === reason.value}
              onChange={() => onReasonChange(reason.value)}
              className="mt-1 accent-[#0b7f76]"
            />
            <span>{reason.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="block text-xs font-semibold">
        หมายเหตุเพิ่มเติม {reasonCode === 'other' ? '*' : <span className="font-normal">[optional]</span>}
        <textarea value={reasonNote ?? ''} onChange={(event) => onReasonNoteChange(event.target.value)} className="mt-1 min-h-16 w-full rounded-md border border-[#e5b9bf] bg-white px-3 py-2 text-sm font-normal text-[#173d50]" />
      </label>
      <p className="text-xs">หลักฐานประกอบ (ถ้ามี) <span className="font-semibold">[OPTIONAL — never blocks confirmation]</span></p>
      {!enabled ? <Notice tone="danger">ยังไม่เปิดใช้งานการรับสินค้าที่ไม่ผ่านเกณฑ์ TOR — รออนุมัติผู้มีสิทธิ์ (P-01/P-02)</Notice> : null}
      <label className="flex items-center gap-2 border-t border-[#efc7cc] pt-2 text-xs font-semibold">
        <input type="checkbox" checked={decision === 'accepted_with_justification'} onChange={(event) => onDecisionChange(event.target.checked ? 'accepted_with_justification' : 'accepted')} className="accent-[#0b7f76]" />
        ยืนยันการยอมรับสินค้าโดยมีเหตุผลประกอบ
      </label>
    </div>
  )
}
