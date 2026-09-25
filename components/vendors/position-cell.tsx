'use client'

import { useState, useTransition } from 'react'
import { api, Button, Input } from '@/components/ui'

/** Inline editor for a person's position title (printed under their name on vendor evaluation reports). Admin only. */
export function PositionCell({ userId, name, position }: { userId: string; name: string; position: string | null }) {
  const [saved, setSaved] = useState(position ?? '')
  const [value, setValue] = useState(position ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dirty = value.trim() !== saved
  return <div className="min-w-48 space-y-1">
    <div className="flex gap-1">
      <Input className="!min-h-9 text-xs" aria-label={`ตำแหน่งของ ${name}`} value={value} maxLength={200} onChange={(event) => setValue(event.target.value)} placeholder="ยังไม่ระบุ" />
      <Button type="button" variant="secondary" className="!min-h-9 px-3 text-xs" disabled={!dirty || pending} onClick={() => {
        setError(null)
        startTransition(async () => {
          try { await api('/api/vendors/signer', { method: 'PUT', body: JSON.stringify({ userId, position: value }) }); setSaved(value.trim()) } catch (caught) { setError(caught instanceof Error ? caught.message : 'บันทึกไม่สำเร็จ') }
        })
      }}>{pending ? '…' : 'บันทึก'}</Button>
    </div>
    {error && <p className="text-xs text-[#a3263a]" role="alert">{error}</p>}
  </div>
}
