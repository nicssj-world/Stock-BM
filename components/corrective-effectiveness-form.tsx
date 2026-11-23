'use client'

import { useState } from 'react'
import { Button, Textarea } from '@/components/ui'

/** Confirms a CAPA's effectiveness with an explicit choice plus a note (instead of OK/Cancel dialogs). Shared by EQA and IQC. */
export function EffectivenessForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (outcome: 'effective' | 'ineffective', note: string) => Promise<boolean>; onCancel: () => void }) {
  const [outcome, setOutcome] = useState<'effective' | 'ineffective' | ''>('')
  const [note, setNote] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!outcome || !note.trim()) return
    await onSubmit(outcome, note)
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-[#dce7e8] bg-[#f8fbfb] p-3">
      <p className="text-xs font-bold text-[#315763]">ผลการยืนยันการแก้ไข</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ผลการยืนยันการแก้ไข">
        {([['effective', 'ได้ผล · ปิด CAPA'], ['ineffective', 'ไม่ได้ผล · เปิด CAPA ต่อ']] as const).map(([value, text]) => (
          <label key={value} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-semibold ${outcome === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d]'}`}>
            <input type="radio" name="effectiveness" value={value} checked={outcome === value} onChange={() => setOutcome(value)} className="accent-[#0b7f76]" />{text}
          </label>
        ))}
      </div>
      <Textarea aria-label="บันทึกผลการยืนยัน" rows={2} placeholder="เช่น ผล EQA รอบถัดไปผ่านเกณฑ์ / ทวนสอบ IQC แล้วอยู่ในเกณฑ์" value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex gap-2">
        <Button className="min-h-8 px-3 text-xs" disabled={busy || !outcome || !note.trim()}>บันทึกผลการยืนยัน</Button>
        <Button type="button" variant="ghost" className="min-h-8 px-3 text-xs" onClick={onCancel}>ยกเลิก</Button>
      </div>
    </form>
  )
}
