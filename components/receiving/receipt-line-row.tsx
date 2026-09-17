'use client'

import type { ReceiptLine, ReceivingWorkspace } from '@/lib/receiving/types'
import { StatusBadge } from '@/components/ui'

export function ReceiptLineRow({ line, data }: { line: ReceiptLine; data: ReceivingWorkspace }) {
  const item = data.items.find((candidate) => candidate.id === line.stockItemId)
  const location = data.locations.find((candidate) => candidate.id === line.locationId)
  const tone = line.torExpiryCompliance === 'compliant' ? 'accepted' : line.torExpiryCompliance === 'not_compliant' ? 'warning' : 'neutral'
  const label = line.torExpiryCompliance === 'compliant' ? '✓ ผ่านเกณฑ์ TOR' : line.torExpiryCompliance === 'not_compliant' ? '⚠ ไม่ผ่าน TOR' : 'ยังไม่ประเมิน TOR'
  return <div className="rounded-md border border-[#dce8e9] bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-[#315763]">{item?.itemCode ?? line.stockItemId} · {item?.name ?? 'ไม่พบ item'}</p><p className="mt-1 text-xs text-[#81979c]">Lot {line.lotNumber ?? '—'} · {line.receivedQty} {item?.unit ?? ''} · {location?.code ?? '—'}</p></div><StatusBadge tone={tone} label={label} /></div>{line.conflicts.length ? <p className="mt-2 text-xs font-semibold text-[#a83541]">ต้องแก้ไขข้อมูลขัดแย้งก่อนยืนยัน</p> : null}</div>
}
