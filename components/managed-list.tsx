'use client'

import { useState } from 'react'
import { Button, Input, StatusBadge } from '@/components/ui'

export interface ManagedItem {
  id: string
  label: string
  sublabel?: string
  isActive: boolean
}

// Reusable master-data list: shows active items by default, with a toggle to
// reveal closed/inactive ones, a search box, a capped scroll height, and a
// per-item close/reopen action. Keeps long-lived lists from cluttering.
export function ManagedList({
  items,
  onToggle,
  searchThreshold = 6,
  noun = 'รายการ',
}: {
  items: ManagedItem[]
  onToggle: (id: string, isActive: boolean) => Promise<boolean>
  searchThreshold?: number
  noun?: string
}) {
  const [showClosed, setShowClosed] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  if (!items.length) return null

  const activeCount = items.filter((i) => i.isActive).length
  const closedCount = items.length - activeCount
  const term = search.trim().toLowerCase()
  const visible = items
    .filter((i) => showClosed || i.isActive)
    .filter((i) => !term || `${i.label} ${i.sublabel ?? ''}`.toLowerCase().includes(term))

  return (
    <div className="space-y-1.5 border-t border-[#e9eff0] pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#58747d]">{noun} ({activeCount} ใช้งาน)</p>
        {closedCount ? (
          <Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'ซ่อนที่ปิด' : `แสดงที่ปิดแล้ว (${closedCount})`}
          </Button>
        ) : null}
      </div>
      {showClosed || items.length > searchThreshold ? (
        <Input className="h-8 text-xs" placeholder="ค้นหา…" value={search} onChange={(e) => setSearch(e.target.value)} />
      ) : null}
      <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
        {visible.map((i) => (
          <div key={i.id} className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${i.isActive ? 'border-[#e3ebec] bg-white' : 'border-[#e9eef0] bg-[#f6f8f9] text-[#8198a0]'}`}>
            <span className="min-w-0 truncate">
              <span className="font-semibold text-[#315763]">{i.label}</span>
              {i.sublabel ? <span className="text-[#9aafb4]"> · {i.sublabel}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={i.isActive ? 'accepted' : 'neutral'} label={i.isActive ? 'ใช้งาน' : 'ปิดแล้ว'} />
              <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" disabled={busy === i.id} onClick={async () => { setBusy(i.id); await onToggle(i.id, !i.isActive); setBusy(null) }}>
                {i.isActive ? 'ปิด' : 'เปิดใช้'}
              </Button>
            </span>
          </div>
        ))}
        {!visible.length ? <p className="px-1 py-3 text-center text-xs text-[#9aafb4]">ไม่พบรายการ</p> : null}
      </div>
    </div>
  )
}
