'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { searchItems, type ItemSearchRow } from '@/lib/receiving/item-search'
import { Button, Input } from '@/components/ui'

/**
 * Item Master lookup by Catalog/REF, item code, name or manufacturer. The
 * Item name always comes from Item Master; nothing is inferred from images
 * or barcodes here.
 */
export function ItemPicker<T extends ItemSearchRow>({ items, value, onChange, disabled = false, initialQuery = '' }: { items: T[]; value: string | null; onChange: (itemId: string | null) => void; disabled?: boolean; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery)
  const selected = items.find((item) => item.id === value) ?? null
  const results = useMemo(() => searchItems(items, query, query.trim() ? 30 : 20), [items, query])

  if (selected) {
    return <div className="flex items-start justify-between gap-3 rounded-md border border-[#b8ded8] bg-[#f4fbf9] p-3">
      <div className="min-w-0">
        <p className="mono text-sm font-bold text-[#0b7f76]">REF {selected.catalogNo || '— ไม่มี Catalog/REF'}</p>
        <p className="mt-0.5 text-sm font-semibold text-[#173d50]">{selected.name}</p>
        <p className="text-xs text-[#81979c]">{selected.itemCode} · {selected.unit}{selected.manufacturer ? ` · ${selected.manufacturer}` : ''}</p>
      </div>
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => { onChange(null); setQuery('') }} aria-label="เปลี่ยน Item"><X className="size-4" />เปลี่ยน</Button>
    </div>
  }

  return <div className="space-y-2">
    <label className="relative block">
      <span className="sr-only">ค้นหา Item ด้วย Catalog/REF หรือชื่อ</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#81979c]" aria-hidden="true" />
      <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} className="pl-9" placeholder="ค้นหา Catalog/REF, รหัส, ชื่อสินค้า" autoComplete="off" inputMode="search" />
    </label>
    {results.length ? <p className="text-xs font-semibold text-[#58747d]" role="status">พบ {results.length} รายการ — แตะที่ชื่อสินค้าเพื่อเลือกก่อนเพิ่มรายการ</p> : null}
    <ul className="max-h-72 divide-y divide-[#edf2f2] overflow-y-auto rounded-md border border-[#dce8e9] bg-white" role="listbox" aria-label="ผลการค้นหา Item">
      {results.map((item) => <li key={item.id}>
        <button type="button" role="option" aria-selected={false} disabled={disabled} onClick={() => onChange(item.id)} className="flex min-h-12 w-full flex-col items-start px-3 py-2 text-left hover:bg-[#f4fbf9] focus:bg-[#f4fbf9] focus:outline-none">
          <span className="mono text-xs font-bold text-[#0b7f76]">{item.catalogNo ? `REF ${item.catalogNo}` : 'ไม่มี Catalog/REF'}</span>
          <span className="text-sm font-semibold text-[#173d50]">{item.name}</span>
          <span className="text-[11px] text-[#81979c]">{item.itemCode}{item.manufacturer ? ` · ${item.manufacturer}` : ''}</span>
        </button>
      </li>)}
      {!results.length ? <li className="px-3 py-4 text-center text-sm text-[#81979c]">ไม่พบ Item ใน Item Master</li> : null}
    </ul>
  </div>
}
