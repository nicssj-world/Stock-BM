'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { api } from '@/components/ui'

type AttachmentModule = 'iqc' | 'eqa' | 'stock' | 'env' | 'lotverif' | 'hpv' | 'equipment'

interface Attachment {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  createdAt: string
}

function humanSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentList({
  module,
  entityType,
  entityId,
  kind,
  canDelete = false,
  canUpload = true,
  accept,
  label = 'ไฟล์แนบ / Attachments',
}: {
  module: AttachmentModule
  entityType: string
  entityId: string
  kind: string
  canDelete?: boolean
  canUpload?: boolean
  accept?: string
  label?: string
}) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      const params = new URLSearchParams({ module, entityType, entityId })
      const data = await api<{ attachments: Attachment[] }>(`/api/attachments?${params}`)
      setItems(data.attachments)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ module, entityType, entityId })
    api<{ attachments: Attachment[] }>(`/api/attachments?${params}`)
      .then((data) => {
        if (active) setItems(data.attachments)
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [module, entityType, entityId])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('module', module)
      form.append('entityType', entityType)
      form.append('entityId', entityId)
      form.append('kind', kind)
      const response = await fetch('/api/attachments', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'อัปโหลดไม่สำเร็จ')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบไฟล์นี้?')) return
    setBusy(true)
    try {
      await api(`/api/attachments/${id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-[#e3ebec] bg-[#fbfdfd] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#55727c]"><Paperclip className="size-3.5" /> {label}</p>
        {canUpload ? <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#c9dadd] bg-white px-2.5 py-1 text-xs font-semibold text-[#244854] hover:border-[#7fa9ad]">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} แนบไฟล์
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
        </label> : null}
      </div>
      {error ? <p className="mt-2 text-xs text-[#c02a37]">{error}</p> : null}
      <ul className="mt-2 space-y-1">
        {items?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-[#e9eff0] bg-white px-2 py-1 text-xs">
            <span className="min-w-0 truncate text-[#315763]">{item.fileName} <span className="text-[#9aafb4]">{humanSize(item.sizeBytes)}</span></span>
            <span className="flex shrink-0 items-center gap-1">
              <a href={`/api/attachments/${item.id}`} className="rounded p-1 text-[#0b7f76] hover:bg-[#eef6f5]" aria-label={`ดาวน์โหลด ${item.fileName}`}><Download className="size-3.5" /></a>
              {canDelete ? <button type="button" onClick={() => remove(item.id)} className="rounded p-1 text-[#c02a37] hover:bg-[#fff0f1]" aria-label={`ลบ ${item.fileName}`}><Trash2 className="size-3.5" /></button> : null}
            </span>
          </li>
        ))}
        {items && !items.length ? <li className="text-xs text-[#9aafb4]">ยังไม่มีไฟล์แนบ</li> : null}
      </ul>
    </div>
  )
}
